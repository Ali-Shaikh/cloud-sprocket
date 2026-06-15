import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));

  console.log('Navigating...');
  await page.goto('http://localhost:1421/');
  console.log('Loaded.');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await browser.close();
})();
