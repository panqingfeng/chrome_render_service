Just install Apache with mod_fcgid and mod_proxy, put two files to cgi-bin,  now you get a Javascript rendering service with a HTTP API!

# Why?
[Splash](https://github.com/scrapinghub/splash) has done a great job on providing rendering service. But Splash use Python and QtWebkit as kernel, memory usage easily out of control, In some worse cases, the service hanged. That't why I setup my own render service base on Chrome myself.

# How?
- [Install Chrome](https://www.google.com/chrome/)
- [Install Node.js version >= 8](https://nodejs.org/en/download/)
- Install Apache 2.x and [mod_fcgid](https://httpd.apache.org/mod_fcgid/) (By the way, I am the creator of this module)

I am using yum, so
```sh
sudo yum install httpd mod_fcgid
```
- Install these Node.js modules
```sh
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
npm -g install puppeteer
npm -g install node-fastcgi
```
- Setup Apache

modify /etc/httpd/conf.modules.d/00-mpm.conf, disable mpm_prefork and enable mpm_event(mpm_prefork may run out of handler in stress test)

```sh
......
#LoadModule mpm_prefork_module modules/mod_mpm_prefork.so
# DISABLE THIS
......
LoadModule mpm_event_module modules/mod_mpm_event.so
# ENABLE THIS
```
- Modify and Copy these to httpd.conf
```sh
# Change Listen port to 9090 or whatever you like

# Proxy and Cache
<VirtualHost *:9090>
  ProxyRequests On
  ProxyTimeout 5   # Change timeout as you like

  CacheRoot /var/cache/httpd/proxy/
  CacheEnable disk http://
  CacheIgnoreNoLastMod On
  CacheStorePrivate On
  CacheStoreNoStore On
</VirtualHost>

# mod_fcgid
FcgidCmdOptions /var/www/cgi-bin/render.fcgi IOTimeout 120 MaxProcesses 10  

# mpm_event
ThreadsPerChild 20
ServerLimit 102
AsyncRequestWorkerFactor 2
MaxRequestWorkers 2040
```
- Put render.js and render.fcgi to /var/www/cgi-bin/, and restart httpd
```sh
copy /path/to/render.js /var/www/cgi-bin/
copy /path/to/render.fcgi /var/www/cgi-bin/
sudo systemctl restart httpd
```
- Now visit http://YOUR_IP:9090/cgi-bin/render.fcgi?url=www.google.com and enjoy it

# More?
- [This blog show how to get a HAR with chrome](https://michaljanaszek.com/blog/generate-har-with-puppeteer)
- You can setup a checker in front of render.fcgi, this script verify the URL is accessable and has a text/html respond body before redirect to real render. Both scripts share the same http proxy, so render.fcgid may do the job a little bit faster:

fastrender.js
```sh
const fcgi = require('node-fastcgi');
const fs = require('fs');
const { Console } = require('console');
const urlparser = require('url');
const request = require('request');

// Change as you like
Proxy = 'http://127.0.0.1:9090';
UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36';
Timeout = 10000;

const logger = new Console(process.stderr, process.stderr);  // stderr output of fcgi process -> Apache's error_log
const LogPrefix = new Date().toTimeString() + ' fastrender.fcgi ' + process.pid.toString() + ':';

var options = {
    url: '',
    method: 'GET',
    encoding: 'binary',
    strictSSL: false,
    jar: true,
    gzip: true,
    timeout: Timeout,
    proxy: Proxy,
    headers: {
      'User-Agent': UserAgent
    }
}

// main
fcgi.createServer(function(req, res) {
      if (req.method === 'GET') {
        let urlData = urlparser.parse(req.url, true);
        let queryData = urlData.query;
        let url = queryData.url;
        logger.log(LogPrefix + 'DEBUG: Begin to check url:' + url);
	
	options.url = url;
	request(options, function (error, response, body) {
		if( error )
		{
			logger.log(LogPrefix + url + ' fail ' + error);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.write(JSON.stringify({url:url, error: error.code}));
			return res.end();
		} else if( response && response.statusCode===200 && response.headers['content-type']
				&& response.headers['content-type'].indexOf('text/html')===0 )
		{
			// redirect to render
			logger.log(LogPrefix + url + ' ok ');
			res.writeHead(302, {'Location': '/cgi-bin/render.fcgi'+urlData.search});
			return res.end();			
		} else {
			let errorinfo = response.statusCode.toString();
			if( response.headers['content-type'] )
				errorinfo = errorinfo + ' ' + response.headers['content-type'];
			logger.log(LogPrefix + url + ' error:' + errorinfo);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.write(JSON.stringify({url:url, error: errorinfo}));
			return res.end();
		}
	});	
      } else {
        res.writeHead(405, 'Method Not Supported', {'Content-Type': 'text/html'});
        return res.end('<!doctype html><html><head><title>405</title></head><body>405: Method Not Supported</body></html>');        
      }
}).listen();
```
fastrender.fcgi
```sh
#!/bin/sh
export NODE_PATH=/usr/lib/node_modules/
exec /usr/bin/node /var/www/cgi-bin/fastrender.js
```
