const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { BitcoinAnalysis, DominanceAnalysis } = require('../models');  // Ensure this path is correct for your project
const plainDb = require('../plainConnection'); // Import the plain DB connection

// Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_PASSWORD,
    region: process.env.S3_REGION
});

const capture = async function(req, res) {
    let browser;
    try {
        // Launch browser and navigate to the page
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.goto('https://blocksquare-automation.com/chart/draw', { waitUntil: 'networkidle0' });

        // Increase timeout and wait for the canvas elements
        console.log('Waiting for #dayChart...');
        await page.waitForSelector('#dayChart', { timeout: 60000 }); // Increase timeout to 60 seconds

        console.log('Waiting for #monthChart...');
        await page.waitForSelector('#monthChart', { timeout: 60000 }); // Increase timeout to 60 seconds

        // Select the canvas elements and take screenshots
        const dayElement = await page.$('#dayChart');
        const monthElement = await page.$('#monthChart');

        if (!dayElement || !monthElement) {
            throw new Error('One or more elements not found on the page');
        }

        const dayBuffer = await dayElement.screenshot();
        const monthBuffer = await monthElement.screenshot();

        await browser.close();

        // Prepare S3 upload parameters
        const dayS3Params = {
            Bucket: 's3bucketjinwoo',
            Key: `charts/day-chart-${uuidv4()}.png`,
            Body: dayBuffer,
            ContentType: 'image/png'
        };

        const monthS3Params = {
            Bucket: 's3bucketjinwoo',
            Key: `charts/month-chart-${uuidv4()}.png`,
            Body: monthBuffer,
            ContentType: 'image/png'
        };

        // Upload both screenshots to S3
        const [dayS3Response, monthS3Response] = await Promise.all([
            s3.upload(dayS3Params).promise(),
            s3.upload(monthS3Params).promise()
        ]);

        // Get the URLs from the S3 responses
        const dayImageUrl = dayS3Response.Location;
        const monthImageUrl = monthS3Response.Location;

        // Fetch the latest row's ID
        const latestEntry = await BitcoinAnalysis.findOne({
            order: [['id', 'DESC']]
        });

        if (!latestEntry) {
            throw new Error('No entries found in the BitcoinAnalysis table');
        }

        // Update the latest row with the new URLs using instance method
        await latestEntry.update({
            daychart_imgUrl: dayImageUrl,
            monthchart_imgUrl: monthImageUrl
        });

        if (res) res.send(`Day chart screenshot saved to S3: ${dayImageUrl}, Month chart screenshot saved to S3: ${monthImageUrl}`);
    } catch (error) {
        console.error('Error:', error);
        if (res) res.status(500).send('Error processing request');
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

const captureDominance = async function(req, res) {
    let browser;
    try {
        // Launch browser and navigate to the page
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.goto('https://blocksquare-automation.com/dominance', { waitUntil: 'networkidle0' });

        // Increase timeout and wait for the canvas elements
        console.log('Waiting for #lineChart...');
        await page.waitForSelector('#lineChart', { timeout: 60000 }); // Increase timeout to 60 seconds

        console.log('Waiting for #doughnutChart...');
        await page.waitForSelector('#doughnutChart', { timeout: 60000 }); // Increase timeout to 60 seconds

        // Select the canvas elements and take screenshots
        const lineElement = await page.$('#lineChart');
        const doughnutElement = await page.$('#doughnutChart');

        if (!lineElement || !doughnutElement) {
            throw new Error('One or more elements not found on the page');
        }

        const lineBuffer = await lineElement.screenshot();
        const doughnutBuffer = await doughnutElement.screenshot();

        await browser.close();

        // Prepare S3 upload parameters
        const lineS3Params = {
            Bucket: 's3bucketjinwoo',
            Key: `charts/line-chart-${uuidv4()}.png`,
            Body: lineBuffer,
            ContentType: 'image/png'
        };

        const doughnutS3Params = {
            Bucket: 's3bucketjinwoo',
            Key: `charts/doughnut-chart-${uuidv4()}.png`,
            Body: doughnutBuffer,
            ContentType: 'image/png'
        };

        // Upload both screenshots to S3
        const [lineS3Response, doughnutS3Response] = await Promise.all([
            s3.upload(lineS3Params).promise(),
            s3.upload(doughnutS3Params).promise()
        ]);

        // Get the URLs from the S3 responses
        const lineImageUrl = lineS3Response.Location;
        const doughnutImageUrl = doughnutS3Response.Location;

        // Fetch the latest row's ID in DominanceAnalysis
        const latestEntry = await DominanceAnalysis.findOne({
            order: [['id', 'DESC']]
        });

        if (!latestEntry) {
            throw new Error('No entries found in the DominanceAnalysis table');
        }

        // Update the latest row with the new URLs using instance method
        await latestEntry.update({
            goya_imgUrl: lineImageUrl,
            dominance_imgUrl: doughnutImageUrl
        });

        if (res) res.send(`Line chart screenshot saved to S3: ${lineImageUrl}, Doughnut chart screenshot saved to S3: ${doughnutImageUrl}`);
    } catch (error) {
        console.error('Error:', error);
        if (res) res.status(500).send('Error processing request');
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

const capturePremium = async function(req, res) {
    let browser;
    try {

        const [latestRow] = await plainDb.query('SELECT datetime FROM beuliping ORDER BY id DESC LIMIT 1');

        if (latestRow.length === 0) {
            if (res) return res.status(404).send('No rows found');
            return;
        }

        console.log(latestRow);

        const latestDatetime = latestRow.datetime;

        // Retrieve all rows that were created within 5 minutes before the latest datetime
        const recentRows = await plainDb.query(`
            SELECT id, symbol 
            FROM beuliping 
            WHERE datetime BETWEEN DATE_SUB(?, INTERVAL 5 MINUTE) AND ?
            ORDER BY datetime DESC
        `, [latestDatetime, latestDatetime]);

        // Log the recent rows for debugging
        console.log('Recent Rows:', recentRows);

        if (recentRows.length === 0) {
            if (res) return res.status(404).send('No recent rows found');
            return;
        }

        // Launch the browser
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // Process each row
        for (const row of recentRows) {
            const { id, symbol } = row;

            // Construct the URL
            const url = `https://retri.xyz/capture_premium.php?kind=${symbol}USDT&hour=120`;

            // Open a new page and navigate to the URL
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle0' });

            // Wait for the chart to load
            console.log(`Waiting for #chart to load for symbol ${symbol}...`);
            await page.waitForSelector('canvas', { timeout: 60000 });

            // Select the canvas element and take a screenshot
            const chartElement = await page.$('.tv-lightweight-charts');

            if (!chartElement) {
                console.error(`Chart element not found for symbol ${symbol}`);
                await page.close();
                continue;
            }

            const chartBuffer = await chartElement.screenshot();

            // Prepare S3 upload parameters
            const chartS3Params = {
                Bucket: 's3bucketjinwoo',
                Key: `premiumchart-${uuidv4()}.png`,
                Body: chartBuffer,
                ContentType: 'image/png'
            };

            // Upload the screenshot to S3
            const chartS3Response = await s3.upload(chartS3Params).promise();

            // Get the URL from the S3 response
            const chartImageUrl = chartS3Response.Location;

            // Update the database with the image URL
            await plainDb.query('UPDATE beuliping SET images = ? WHERE id = ?', [chartImageUrl, id]);

            console.log(`Updated row ${id} with image URL ${chartImageUrl}`);

            // Close the page
            await page.close();
        }

        if (res) res.send('Screenshots captured and updated successfully.');
    } catch (error) {
        console.error('Error:', error);
        if (res) res.status(500).send('Error processing request');
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

router.get('/', capture);
router.get('/dominance', captureDominance);
router.get('/premium', capturePremium);

module.exports = {
    router,
    capture,
    captureDominance,
    capturePremium
};
