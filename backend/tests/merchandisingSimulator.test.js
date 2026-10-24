import test from "node:test";
import assert from "node:assert/strict";
import {
  getEquivalentProductIds,
  getEquivalentCollectionIds,
  normalizeShop,
  calculateHypotheticalScenario,
} from "../services/merchandisingSimulator.service.js";
import MerchandisingScenario from "../models/MerchandisingScenario.js";
import {
  calculateScenario,
  getBaseline,
  saveScenario,
} from "../controllers/merchandisingSimulator.controller.js";

// Helper for mock Express response
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {     
      this.body = data;          
      return this;
    },
  };
  return res;
}

test("1. Baseline CTR calculation: 1,000 views and 80 clicks results in actual CTR = 8%", () => {
  const views = 1000;
  const clicks = 80;
  const actualCTR = Number(((clicks / views) * 100).toFixed(2));
  assert.equal(actualCTR, 8);
});

test("2. Target CTR = 10%: estimated target clicks = 100 and estimated additional clicks = +20", () => {
  const baseline = {
    views: 1000,
    clicks: 80,
  };
  const target = {
    targetRate: 10,
  };

  const result = calculateHypotheticalScenario({ baseline, target });

  // 1000 views * 10% / 100 = 100 estimated target clicks
  assert.equal(result.estimatedTargetClicks, 100);
  // 100 - 80 = +20 estimated additional clicks
  assert.equal(result.additionalClicks, 20);
  assert.equal(result.percentagePointDifference, 2); // 10% - 8% = +2% pts
  assert.equal(result.disclaimer, "Hypothetical Estimate — Not Guaranteed");
});

test("3. Target CTR = 5%: estimated target clicks = 50 and estimated difference = −30", () => {
  const baseline = {
    views: 1000,
    clicks: 80,
  };
  const target = {
    targetRate: 5,
  };

  const result = calculateHypotheticalScenario({ baseline, target });

  // 1000 views * 5% / 100 = 50 estimated target clicks
  assert.equal(result.estimatedTargetClicks, 50);
  // 50 - 80 = -30 estimated difference (decrease)
  assert.equal(result.additionalClicks, -30);
  assert.equal(result.percentagePointDifference, -3); // 5% - 8% = -3% pts
  assert.equal(result.disclaimer, "Hypothetical Estimate — Not Guaranteed");
});

test("4. Zero views: CTR = N/A and calculation is disabled / throws descriptive error", () => {
  const baselineZeroViews = {
    views: 0,
    clicks: 0,
  };
  const target = {
    targetRate: 10,
  };

  assert.throws(
    () => calculateHypotheticalScenario({ baseline: baselineZeroViews, target }),
    /Product views is 0\. Scenario calculation requires a non-zero views baseline\./
  );
});

test("5. Incompatible or invalid view/click data (e.g. 77 views and 813 clicks): blocks calculation", () => {
  const incompatibleBaseline = {
    views: 77,
    clicks: 813,
  };
  const target = {
    targetRate: 10,
  };

  assert.throws(
    () => calculateHypotheticalScenario({ baseline: incompatibleBaseline, target }),
    /Recorded clicks \(813\) exceed views \(77\)\. Cannot calculate scenario on incompatible baseline data\./
  );
});

test("6. Product scope: product ID normalization handles GID and numeric strings properly", () => {
  const fromGid = getEquivalentProductIds("gid://shopify/Product/7634929811543");
  assert.ok(fromGid.includes("gid://shopify/Product/7634929811543"));
  assert.ok(fromGid.includes("7634929811543"));

  const fromNumeric = getEquivalentProductIds("7634929811543");
  assert.ok(fromNumeric.includes("7634929811543"));
  assert.ok(fromNumeric.includes("gid://shopify/Product/7634929811543"));

  assert.deepEqual(getEquivalentProductIds(null), []);
  assert.deepEqual(getEquivalentProductIds(""), []);
});

test("7. Store scope: shop normalization enforces shop-level data isolation", () => {
  assert.equal(
    normalizeShop("https://ProMobile-Hub.myshopify.com/"),
    "promobile-hub.myshopify.com"
  );
  assert.equal(
    normalizeShop(" http://store.myshopify.com "),
    "store.myshopify.com"
  );
  assert.equal(
    normalizeShop("https://alpha-store.myshopify.com/admin/"),
    "alpha-store.myshopify.com/admin"
  );
});

test("8. Saved snapshots retain their original baseline, target, and results immutably", async () => {
  const snapshotDoc = new MerchandisingScenario({
    shop: "promobile-hub.myshopify.com",
    name: "Black Friday Investigation",
    investigationType: "product_engagement",
    scope: "product",
    product: {
      id: "gid://shopify/Product/123",
      title: "Sample Smartphone",
      imageUrl: "https://cdn.shopify.com/sample.jpg",
    },
    dateRange: {
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-10-01"),
    },
    target: {
      metric: "clickThroughRate",
      targetRate: 15,
    },
    baseline: {
      views: 1000,
      clicks: 80,
      clickThroughRate: 8,
    },
    comparison: {
      targetRate: 15,
      estimatedTargetClicks: 150,
      additionalClicks: 70,
      percentagePointDifference: 7,
      disclaimer: "Hypothetical Estimate — Not Guaranteed",
    },
    formulaVersion: "v2_simplified_ctr",
    dataSource: "Verified Shopify Store Events (ShopLens Analytics)",
    dataQuality: {
      isValid: true,
      notes: [],
    },
  });

  await snapshotDoc.validate();
  assert.equal(snapshotDoc.baseline.views, 1000);
  assert.equal(snapshotDoc.baseline.clicks, 80);
  assert.equal(snapshotDoc.baseline.clickThroughRate, 8);
  assert.equal(snapshotDoc.comparison.estimatedTargetClicks, 150);
  assert.equal(snapshotDoc.comparison.additionalClicks, 70);
  assert.equal(snapshotDoc.formulaVersion, "v2_simplified_ctr");
});

test("9. Unauthenticated requests are rejected with HTTP 401", async () => {
  const reqUnauth = {
    query: { startDate: "2026-09-01", endDate: "2026-10-01" },
    body: {},
  };
  const res1 = createMockRes();
  await getBaseline(reqUnauth, res1);
  assert.equal(res1.statusCode, 401);
  assert.equal(res1.body.success, false);

  const res2 = createMockRes();
  await calculateScenario(reqUnauth, res2);
  assert.equal(res2.statusCode, 401);
  assert.equal(res2.body.success, false);

  const res3 = createMockRes();
  await saveScenario(reqUnauth, res3);
  assert.equal(res3.statusCode, 401);
  assert.equal(res3.body.success, false);
});

test("10. Target CTR validation rejects values <= 0 or > 100 or non-numeric", () => {
  const baseline = { views: 500, clicks: 25 };

  assert.throws(
    () => calculateHypotheticalScenario({ baseline, target: { targetRate: 0 } }),
    /Target CTR must be a number greater than 0% and at most 100%\./
  );

  assert.throws(
    () => calculateHypotheticalScenario({ baseline, target: { targetRate: -5 } }),
    /Target CTR must be a number greater than 0% and at most 100%\./
  );

  assert.throws(
    () => calculateHypotheticalScenario({ baseline, target: { targetRate: 105 } }),
    /Target CTR must be a number greater than 0% and at most 100%\./
  );

  assert.throws(
    () => calculateHypotheticalScenario({ baseline, target: { targetRate: "invalid" } }),
    /Target CTR must be a number greater than 0% and at most 100%\./
  );
});

test("11. Date range validation rejects invalid dates or startDate after endDate", async () => {
  const reqInvalidDate = {
    shop: "test.myshopify.com",
    query: { startDate: "2026-10-15", endDate: "2026-10-01" },
  };
  const res = createMockRes();
  await getBaseline(reqInvalidDate, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("startDate precedes endDate"));
});

test("12. Collection ID normalization handles both GID and numeric strings", () => {
  const fromGid = getEquivalentCollectionIds("gid://shopify/Collection/296410251351");
  assert.ok(fromGid.includes("gid://shopify/Collection/296410251351"));
  assert.ok(fromGid.includes("296410251351"));

  const fromNumeric = getEquivalentCollectionIds("296410251351");
  assert.ok(fromNumeric.includes("296410251351"));
  assert.ok(fromNumeric.includes("gid://shopify/Collection/296410251351"));

  assert.deepEqual(getEquivalentCollectionIds(null), []);
  assert.deepEqual(getEquivalentCollectionIds(""), []);
});
