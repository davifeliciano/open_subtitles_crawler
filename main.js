const fs = require("fs");
const puppeteer = require("puppeteer");

const loginInfo = JSON.parse(fs.readFileSync("login.json").toString());
const showUlr =
  "https://www.opensubtitles.org/pb/ssearch/sublanguageid-all/idmovie-4420";

// Selector to find every episode link in the show page
const episodeLinkSelector = "tr[itemprop='episode'] td:first-child a";

// Selector to find the first download link for a Brazilian Portuguese subtitle
const downloadLinkSelector =
  "tr:has(td a[title='Portuguese (BR)']) td:nth-child(5) a";

async function getNewBrowserTab(browser) {
  let resultPromise;

  const onTargetcreatedHandler = async (target) => {
    if (target.type() === "page") {
      const newPage = await target.page();
      const newPagePromise = new Promise((y) =>
        newPage.once("domcontentloaded", () => y(newPage))
      );

      const isPageLoaded = await newPage.evaluate(() => document.readyState);
      browser.off("targetcreated", onTargetcreatedHandler); // Unsubscribing

      return isPageLoaded.match("complete|interactive")
        ? resultPromise(newPage)
        : resultPromise(newPagePromise);
    }
  };

  return new Promise((resolve) => {
    resultPromise = resolve;
    browser.on("targetcreated", onTargetcreatedHandler);
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 1024 });

  await page.goto("https://www.opensubtitles.org/pb");

  // Click login link
  const loginLinkSelector = "#logindetail > a";
  await page.waitForSelector(loginLinkSelector);
  await page.click(loginLinkSelector);

  // Type username
  const usernameInputSelector = "input[name='user']";
  await page.waitForSelector(usernameInputSelector);
  await page.type(usernameInputSelector, loginInfo.username);

  // Type password
  const passwordInputSelector = "input[name='password']";
  await page.waitForSelector(passwordInputSelector);
  await page.type(passwordInputSelector, loginInfo.password);

  const waitForNavOptions = { timeout: 60_000 };
  await page.waitForNavigation(waitForNavOptions);
  await page.goto(showUlr);
  await page.waitForNetworkIdle();
  const episodeLinks = await page.$$(episodeLinkSelector);

  for (const link of episodeLinks) {
    await link.click({ button: "middle" });
    const newPage = await getNewBrowserTab(browser);
    await newPage.bringToFront();
    await newPage.waitForNetworkIdle();
    await newPage.click(downloadLinkSelector);
    await newPage.waitForNetworkIdle();

    // Wait for captcha to be solved, if there is any
    await newPage.waitForFunction(
      "document.querySelector('.g-recaptcha-response') === null"
    );

    await newPage.close();
  }
})();
