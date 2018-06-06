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
npm -g install website-scraper
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
- Copy these to httpd.conf
```sh
# Proxy and Cache
<VirtualHost *:80>    # Change to the port number you are using
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
FcgidCmdOptions /var/www/cgi-bin/fastrender.fcgi IOTimeout 240 MaxProcesses 50

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
- Now visit http://YOUR_IP/cgi-bin/render.fcgi?url=www.example.com and enjoy it

