const fcgi = require('node-fastcgi');
const puppeteer = require('puppeteer');
const { Console } = require('console');
const urlparser = require('url');

// Change as you like
UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36';
Width = 1024;
Height = 768;
ChromePath = '/usr/bin/google-chrome-stable';
ChromeArgs = ['--proxy-server=127.0.0.1:9090'];
//ChromeArgs = [];

const logger = new Console(process.stderr, process.stderr);  // stderr output of fcgi process -> Apache's error_log
const LogPrefix = new Date().toTimeString() + ' render.fcgi ' + process.pid.toString() + ':';
function asyncError(location, url, error) {
  logger.log(LogPrefix + 'FATAL: asyncError:' + location + ':' + url + '->' + error.message);
  process.exit(0);
}

// main
(async () => {
  const browser = await puppeteer.launch({executablePath: ChromePath, ignoreHTTPSErrors: true, args: ChromeArgs}).catch(error=>{asyncError('lauch', '', error);});
  process.on('SIGTERM', function(){
    logger.log(LogPrefix + 'FATAL: SIGTERM');
    browser.close();
    process.exit(0);
  });  

  var page = await browser.newPage().catch(error=>{asyncError('browser.newPage', '', error);});
  await page.setUserAgent(UserAgent).catch(error=>{asyncError('page.setUserAgent', '', error);});
  await page.setViewport({width:Width, height:Height}).catch(error=>{asyncError('page.setViewport', '', error);});

  fcgi.createServer(function(req, res) {
      if (req.method === 'GET') {
        let queryData = urlparser.parse(req.url, true).query;
        let url = queryData.url;
        logger.log(LogPrefix + 'DEBUG: Begin to handle url:' + url);
        page.goto(url, {waitUntil: 'networkidle2'}).catch(error=>{asyncError('page.goto', url, error);}).then(async http_respond => {
          if( typeof http_respond === 'undefined' || http_respond === null )
            asyncError('page.goto', url, 'http_respond is null');

          if( !http_respond.ok() ) {
            logger.log(LogPrefix + 'ERROR: downloadError: page.goto.then:' + url + '->' + http_respond.status());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.write(JSON.stringify({url:url, error:http_respond.status()}));
            return res.end();
          }

          // page.goto get http_respond.ok() now, take screenshot
          logger.log(LogPrefix + 'DEBUG: Begin to take screenshot for url:' + url);
          page.screenshot().catch(error=>{asyncError('page.screenshot', url, error);}).then(async imgbuffer => {
            // get page html content
            page.content().catch(error=>{asyncError('page.content', url, error);}).then(async htmlcontent => {
              logger.log(LogPrefix + 'DEBUG: render done for url:' + url);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.write(JSON.stringify({url:url, landing_url:page.url(), html:htmlcontent, png: imgbuffer.toString('base64')}));
              res.end();
            });
          });
        });
      } else {
        res.writeHead(405, 'Method Not Supported', {'Content-Type': 'text/html'});
        return res.end('<!doctype html><html><head><title>405</title></head><body>405: Method Not Supported</body></html>');        
      }
  }).listen();
})();
