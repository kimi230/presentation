const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 9876;
const WIDTH = 1920;
const HEIGHT = 1080;
const OUTPUT = path.join(__dirname, 'AI_이해와_업무활용_강의자료.pdf');

// Simple static file server
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.webp': 'image/webp',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
      };
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

(async () => {
  console.log('Starting local server...');
  const server = await startServer();

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [`--window-size=${WIDTH},${HEIGHT}`],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });

  console.log('Loading presentation...');
  await page.goto(`http://localhost:${PORT}/index.html`, {
    waitUntil: 'networkidle0',
    timeout: 30000,
  });

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 2000));

  // Get total slide count
  const totalSlides = await page.evaluate(() =>
    document.querySelectorAll('.slide').length
  );
  console.log(`Found ${totalSlides} slides`);

  // Capture each slide as a screenshot
  const screenshots = [];
  for (let i = 0; i < totalSlides; i++) {
    console.log(`Capturing slide ${i + 1}/${totalSlides}...`);

    await page.evaluate((slideIndex) => {
      const slides = document.querySelectorAll('.slide');

      // Hide all UI controls
      document.querySelectorAll('.progress-bar, .slide-counter, .nav-controls, .qr-btn, .qr-overlay').forEach(el => {
        el.style.display = 'none';
      });

      // Deactivate all slides
      slides.forEach(s => {
        s.classList.remove('active', 'prev');
        s.style.transition = 'none';
        s.style.opacity = '0';
        s.style.transform = 'none';
        s.style.pointerEvents = 'none';
      });

      // Activate target slide
      const target = slides[slideIndex];
      target.classList.add('active');
      target.style.opacity = '1';
      target.style.transform = 'none';
      target.style.pointerEvents = 'auto';
      target.scrollTop = 0;

      // Reveal all hidden answers for PDF
      target.querySelectorAll('.reveal-target').forEach(el => {
        el.classList.add('revealed');
        el.style.maxHeight = '500px';
        el.style.opacity = '1';
      });

      // Make body background match slide
      document.body.style.background = '#F0FDFA';
      document.documentElement.style.background = '#F0FDFA';
    }, i);

    // Wait for any transitions/images to settle
    await new Promise(r => setTimeout(r, 300));

    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: WIDTH,
        height: HEIGHT,
      },
    });
    screenshots.push(screenshot);
  }

  console.log('Generating PDF...');

  // Create a new page for the PDF
  const pdfPage = await browser.newPage();

  // Build HTML with all slide screenshots
  const imgTags = screenshots.map((buf, i) => {
    const base64 = buf.toString('base64');
    return `<div class="page"><img src="data:image/png;base64,${base64}" /></div>`;
  }).join('\n');

  const pdfHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  @page {
    size: 1920px 1080px;
    margin: 0;
  }
  * { margin: 0; padding: 0; }
  body { margin: 0; padding: 0; }
  .page {
    width: 1920px;
    height: 1080px;
    page-break-after: always;
    overflow: hidden;
  }
  .page:last-child {
    page-break-after: avoid;
  }
  .page img {
    width: 1920px;
    height: 1080px;
    display: block;
  }
</style>
</head>
<body>
${imgTags}
</body>
</html>`;

  await pdfPage.setContent(pdfHtml, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  await pdfPage.pdf({
    path: OUTPUT,
    width: '1920px',
    height: '1080px',
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    printBackground: true,
    preferCSSPageSize: true,
  });

  console.log(`PDF saved to: ${OUTPUT}`);

  await browser.close();
  server.close();
  console.log('Done!');
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
