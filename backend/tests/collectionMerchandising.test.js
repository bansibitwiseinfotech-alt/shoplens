import assert from "node:assert/strict";
import test from "node:test";

import Collection from "../models/Collection.js";
import MerchandisingEvent from "../models/MerchandisingEvent.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import {
    getCollectionDetail,
    getCollectionOverview,
} from "../services/collectionMerchandisingService.js";

const collectionIds = {
    first: "gid://shopify/Collection/1",
    second: "gid://shopify/Collection/2",
    third: "gid://shopify/Collection/3",
    fourth: "gid://shopify/Collection/4",
};

const productId = (id) => `gid://shopify/Product/${id}`;
const orderId = (id) => `gid://shopify/Order/${id}`;

const collections = [
    {
        shop: "merchant.myshopify.com",
        shopifyCollectionId: collectionIds.first,
        title: "First collection",
        productIds: ["1", "2", "3", "4", "5", "6"].map(productId),
    },
    {
        shop: "merchant.myshopify.com",
        shopifyCollectionId: collectionIds.second,
        title: "Second collection",
        productIds: [productId(7), productId(9)],
    },
    {
        shop: "merchant.myshopify.com",
        shopifyCollectionId: collectionIds.third,
        title: "Third collection",
        productIds: [productId(8)],
    },
    {
        shop: "merchant.myshopify.com",
        shopifyCollectionId: collectionIds.fourth,
        title: "Fourth collection",
        productIds: [productId(10)],
    },
];

const group = (collection, product, eventType, count, order = null) => ({
    _id: {
        collectionId: collection,
        productId: product,
        eventType,
        orderId: order,
    },
    count,
});

const eventGroups = [
    group(collectionIds.first, null, "collection_view", 7),
    group(collectionIds.first, productId(2), "product_click", 5),
    group(collectionIds.first, productId(3), "product_click", 20),
    group(collectionIds.first, productId(3), "purchase", 4, orderId(3)),
    group(collectionIds.first, productId(4), "product_click", 10),
    group(collectionIds.first, productId(4), "purchase", 1, orderId(4)),
    group(collectionIds.first, productId(5), "product_click", 5),
    group(collectionIds.first, productId(6), "product_click", 10),
    group(collectionIds.first, productId(6), "purchase", 8, orderId(6)),
    group(collectionIds.second, productId(7), "product_click", 50),
    group(collectionIds.second, productId(7), "purchase", 2, orderId(7)),
    group(collectionIds.second, productId(9), "purchase", 4, orderId(9)),
    group(collectionIds.third, productId(8), "purchase", 1, orderId(8)),
    group(collectionIds.fourth, productId(10), "product_click", 10),
];

const orders = [
    {
        shopifyOrderId: orderId(3),
        financialStatus: "PAID",
        currencyCode: "CAD",
        lineItems: [{ productId: productId(3), price: 10, quantity: 2 }],
    },
    {
        shopifyOrderId: orderId(4),
        financialStatus: "PAID",
        currencyCode: "CAD",
        lineItems: [{ productId: productId(4), price: 5, quantity: 1 }],
    },
    {
        shopifyOrderId: orderId(6),
        financialStatus: "PAID",
        currencyCode: "CAD",
        lineItems: [{ productId: productId(6), price: 3, quantity: 2 }],
    },
    {
        shopifyOrderId: orderId(7),
        financialStatus: "PAID",
        currencyCode: "CAD",
        lineItems: [{ productId: productId(7), price: 10, quantity: 2 }],
    },
    {
        shopifyOrderId: orderId(8),
        financialStatus: "PAID",
        currencyCode: "CAD",
        lineItems: [{ productId: productId(8), price: 4, quantity: 1 }],
    },
    {
        shopifyOrderId: orderId(9),
        financialStatus: "VOIDED",
        currencyCode: "CAD",
        lineItems: [{ productId: productId(9), price: 20, quantity: 4 }],
    },
];

async function withModelMocks(run) {
    const originals = {
        collectionFind: Collection.find,
        collectionFindOne: Collection.findOne,
        eventAggregate: MerchandisingEvent.aggregate,
        orderFind: Order.find,
        productFind: Product.find,
    };

    Collection.find = () => ({ lean: async () => collections });
    Collection.findOne = () => ({
        lean: async () => collections[0],
    });
    MerchandisingEvent.aggregate = async () => eventGroups;
    Order.find = () => ({ lean: async () => orders });
    Product.find = () => ({
        lean: async () =>
            collections.flatMap((collection) =>
                collection.productIds.map((id) => ({
                    shopifyProductId: id,
                    title: `Product ${id.split("/").pop()}`,
                }))
            ),
    });

    try {
        await run();
    } finally {
        Collection.find = originals.collectionFind;
        Collection.findOne = originals.collectionFindOne;
        MerchandisingEvent.aggregate = originals.eventAggregate;
        Order.find = originals.orderFind;
        Product.find = originals.productFind;
    }
}

test("overview counts events, uses order line-item revenue, and classifies collections", async () => {
    await withModelMocks(async () => {
        const result = await getCollectionOverview({
            shop: "merchant.myshopify.com",
            startDate: new Date("2026-01-01T00:00:00.000Z"),
            endDate: new Date("2026-01-30T23:59:59.999Z"),
        });

        assert.deepEqual(result.summary, {
            totalCollections: 4,
            collectionsWithSales: 3,
            underperformingCollections: 1,
            productsToReposition: 3,
        });
        assert.equal(result.currency, "CAD");

        const firstCollection = result.collections.find(
            (collection) => collection.collectionId === collectionIds.first
        );
        const secondCollection = result.collections.find(
            (collection) => collection.collectionId === collectionIds.second
        );
        const thirdCollection = result.collections.find(
            (collection) => collection.collectionId === collectionIds.third
        );
        const fourthCollection = result.collections.find(
            (collection) => collection.collectionId === collectionIds.fourth
        );

        assert.equal(firstCollection.views, 7);
        assert.equal(firstCollection.productClicks, 50);
        assert.equal(firstCollection.purchases, 3);
        assert.equal(firstCollection.conversionRate, 6);
        assert.equal(firstCollection.revenue, 31);
        assert.equal(firstCollection.performance, "Good");
        assert.equal(firstCollection.action, "View Details");
        assert.equal(secondCollection.purchases, 1);
        assert.equal(secondCollection.revenue, 20);
        assert.equal(secondCollection.performance, "Needs Attention");
        assert.equal(secondCollection.action, "Review Products");
        assert.equal(thirdCollection.performance, "Not Enough Data");
        assert.equal(fourthCollection.performance, "No Sales");
        assert.equal(fourthCollection.conversionRate, 0);
    });
});

test("detail preserves productIds order and returns simple product suggestions", async () => {
    await withModelMocks(async () => {
        const result = await getCollectionDetail({
            shop: "merchant.myshopify.com",
            collectionId: collectionIds.first,
            startDate: new Date("2026-01-01T00:00:00.000Z"),
            endDate: new Date("2026-01-30T23:59:59.999Z"),
        });

        assert.deepEqual(
            result.products.map(({ position }) => position),
            [1, 2, 3, 4, 5, 6]
        );
        assert.equal(result.products[0].issue, null);
        assert.equal(result.products[0].action, "Not Enough Data");
        assert.equal(result.products[1].action, "Not Enough Data");
        assert.equal(result.products[2].action, "Consider Moving Lower");
        assert.equal(result.products[5].action, "Consider Moving Higher");
        assert.equal(result.performance.purchases, 3);
        assert.equal(result.performance.revenue, 31);
        assert.equal(result.performance.status, "Good");
        assert.equal(result.performance.storeConversionRate, 4.55);
        assert.equal(result.recommendations.length, 3);
    });
});
