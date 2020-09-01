
import { join } from 'path';
import { outputFileSync } from 'fs-extra';
import { AddressInfo } from 'net';
import http from 'http';
import connect from 'connect';
import finalhandler from 'finalhandler';
import puppeteer from 'puppeteer';
import { percySnapshot } from '@percy/puppeteer';
import 'dotenv/config';

import { debug } from './debug';

const createServer = async html => {
  const app = connect();
  app.use(
    (request, response, next) =>
      request.url === '/' ? response.end(html) : next()
  );
  app.use(finalhandler);
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    const startServer = () => {
      server.once('error', (e: any) => {
        if (e.code === 'EADDRINUSE') server.close(startServer);
      });
      server.listen(0, resolve);
      server.on('error', reject)
    };
    startServer();
  });
  return server;
};

const generateImage = async (url, fileName, options) => {
  // Options see:
  // https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // devtools: true,
    // dumpio: true,
    args: [
      '--no-sandbox',
      '--disable-lcd-text',
      '--disable-setuid-sandbox',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-infobars',
      '--disable-web-security',
      '--no-default-browser-check',
      '--use-mock-keychain',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-extensions',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--allow-file-access-from-files',
    ],
  });
  const page = await browser.newPage();

  await page.goto(
    url,
    { waitUntil: 'networkidle0' }
  );

  await page.evaluateHandle('document.fonts.ready');

  if (process.env.CI) {
    await percySnapshot(page, fileName, options)
  } else {
    const image = await page.screenshot(options);
    outputFileSync(join(process.cwd(), `__screenshots__/${fileName}.png`), image);
  }

  browser.close();
};

const SCREENSHOTS = {};
const getImageFileName = () => {
  const state = expect.getState();
  const testName = state.currentTestName;
  if (SCREENSHOTS[testName]) {
    SCREENSHOTS[testName]++;
  } else {
    SCREENSHOTS[testName] = 0;
  }
  const index = SCREENSHOTS[testName];
  return `${state.currentTestName}${index > 0 ? index : ''}`;
}

const screenshot = async (options = { debug: true }) => {
  if (options.debug) debug(document);

  const fileName = getImageFileName();
  const html = document.documentElement.outerHTML;
  const server = await createServer(html);
  const { port } = server.address() as AddressInfo;
  const url = `http://localhost:${port}`;

  await generateImage(url, fileName, options);
  await new Promise(resolve => server.close(resolve));
};

export { screenshot };
