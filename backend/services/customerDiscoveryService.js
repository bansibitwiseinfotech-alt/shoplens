import CustomerDiscoveryEvent from "../models/CustomerDiscoveryEvent.js";

export function getDefaultDateRange() {
    const to = new Date();

    const from = new Date();
    from.setDate(from.getDate() - 30);

    return {
        from,
        to,
    };
}

export function getJourneyStage(eventType) {
    switch (eventType) {
        case "search_submitted":
            return "search";

        case "collection_viewed":
            return "collection";

        case "product_viewed":
            return "product";

        case "product_added_to_cart":
            return "cart";

        case "checkout_started":
            return "checkout";

        case "checkout_completed":
            return "purchase";

        default:
            return null;
    }
}

export function getEmptyJourney() {
    return {
        search: false,
        collection: false,
        product: false,
        cart: false,
        purchase: false,
    };
}

export function buildJourneys(events) {
    const sessionMap = new Map();

    for (const event of events) {
        const key = `${event.clientId}_${event.sessionId}`;

        if (!sessionMap.has(key)) {
            sessionMap.set(key, {
                clientId: event.clientId,
                sessionId: event.sessionId,
                firstEventAt: event.occurredAt,
                lastEventAt: event.occurredAt,
                stages: getEmptyJourney(),
                events: [],
            });
        }

        const journey = sessionMap.get(key);

        if (event.occurredAt < journey.firstEventAt) {
            journey.firstEventAt = event.occurredAt;
        }

        if (event.occurredAt > journey.lastEventAt) {
            journey.lastEventAt = event.occurredAt;
        }

        const stage = getJourneyStage(event.eventType);

        if (stage === "search") {
            journey.stages.search = true;
        }

        if (stage === "collection") {
            journey.stages.collection = true;
        }

        if (stage === "product") {
            journey.stages.product = true;
        }

        if (stage === "cart") {
            journey.stages.cart = true;
        }

        if (stage === "purchase") {
            journey.stages.purchase = true;
        }

        journey.events.push(event);
    }

    return Array.from(sessionMap.values());
}

export function calculatePercentage(value, total) {
    if (!total) {
        return 0;
    }

    return Number(((value / total) * 100).toFixed(2));
}

export function calculateDropOff(previous, next) {
    return Math.max(previous - next, 0);
}

export function calculateJourneyMetrics(journeys) {
    const searchCustomers = journeys.filter(
        (journey) => journey.stages.search
    ).length;

    const collectionCustomers = journeys.filter(
        (journey) => journey.stages.search && journey.stages.collection
    ).length;

    const productCustomers = journeys.filter(
        (journey) =>
            journey.stages.search &&
            journey.stages.collection &&
            journey.stages.product
    ).length;

    const cartCustomers = journeys.filter(
        (journey) =>
            journey.stages.search &&
            journey.stages.collection &&
            journey.stages.product &&
            journey.stages.cart
    ).length;

    const purchaseCustomers = journeys.filter(
        (journey) =>
            journey.stages.search &&
            journey.stages.collection &&
            journey.stages.product &&
            journey.stages.cart &&
            journey.stages.purchase
    ).length;

    const searchToCollection = calculatePercentage(
        collectionCustomers,
        searchCustomers
    );

    const collectionToProduct = calculatePercentage(
        productCustomers,
        collectionCustomers
    );

    const productToCart = calculatePercentage(
        cartCustomers,
        productCustomers
    );

    const cartToPurchase = calculatePercentage(
        purchaseCustomers,
        cartCustomers
    );

    const stages = [
        {
            key: "search_to_collection",
            from: "Search",
            to: "Collection",
            customers: collectionCustomers,
            previousCustomers: searchCustomers,
            conversionRate: searchToCollection,
            dropOff: calculateDropOff(
                searchCustomers,
                collectionCustomers
            ),
        },
        {
            key: "collection_to_product",
            from: "Collection",
            to: "Product",
            customers: productCustomers,
            previousCustomers: collectionCustomers,
            conversionRate: collectionToProduct,
            dropOff: calculateDropOff(
                collectionCustomers,
                productCustomers
            ),
        },
        {
            key: "product_to_cart",
            from: "Product",
            to: "Cart",
            customers: cartCustomers,
            previousCustomers: productCustomers,
            conversionRate: productToCart,
            dropOff: calculateDropOff(
                productCustomers,
                cartCustomers
            ),
        },
        {
            key: "cart_to_purchase",
            from: "Cart",
            to: "Purchase",
            customers: purchaseCustomers,
            previousCustomers: cartCustomers,
            conversionRate: cartToPurchase,
            dropOff: calculateDropOff(
                cartCustomers,
                purchaseCustomers
            ),
        },
    ];

    const biggestDropOff = stages.reduce(
        (largest, current) => {
            if (!largest) {
                return current;
            }

            return current.dropOff > largest.dropOff ? current : largest;
        },
        null
    );

    return {
        totals: {
            customersTracked: journeys.length,
            searchCustomers,
            collectionCustomers,
            productViews: productCustomers,
            cartAdds: cartCustomers,
            purchases: purchaseCustomers,
        },

        funnel: [
            {
                key: "search",
                label: "Search",
                customers: searchCustomers,
            },
            {
                key: "collection",
                label: "Collection",
                customers: collectionCustomers,
                conversionRate: searchToCollection,
                dropOff: calculateDropOff(
                    searchCustomers,
                    collectionCustomers
                ),
            },
            {
                key: "product",
                label: "Product",
                customers: productCustomers,
                conversionRate: collectionToProduct,
                dropOff: calculateDropOff(
                    collectionCustomers,
                    productCustomers
                ),
            },
            {
                key: "cart",
                label: "Cart",
                customers: cartCustomers,
                conversionRate: productToCart,
                dropOff: calculateDropOff(
                    productCustomers,
                    cartCustomers
                ),
            },
            {
                key: "purchase",
                label: "Purchase",
                customers: purchaseCustomers,
                conversionRate: cartToPurchase,
                dropOff: calculateDropOff(
                    cartCustomers,
                    purchaseCustomers
                ),
            },
        ],

        stageConversions: stages,

        biggestDropOff: biggestDropOff
            ? {
                from: biggestDropOff.from,
                to: biggestDropOff.to,
                dropOff: biggestDropOff.dropOff,
                conversionRate: biggestDropOff.conversionRate,
            }
            : null,

        overallPurchaseRate: calculatePercentage(
            purchaseCustomers,
            searchCustomers
        ),
    };
}

export async function getOverview({
    shopDomain,
    from,
    to,
}) {
    const dateRange = getDefaultDateRange();

    const startDate = from ? new Date(from) : dateRange.from;
    const endDate = to ? new Date(to) : dateRange.to;

    endDate.setHours(23, 59, 59, 999);

    const events = await CustomerDiscoveryEvent.find({
        shopDomain,
        occurredAt: {
            $gte: startDate,
            $lte: endDate,
        },
    })
        .sort({
            occurredAt: 1,
        })
        .lean();

    const journeys = buildJourneys(events);

    const metrics = calculateJourneyMetrics(journeys);

    return {
        dateRange: {
            from: startDate,
            to: endDate,
        },
        ...metrics,
    };
}

export async function saveEvent(payload) {
    const existingEvent = await CustomerDiscoveryEvent.findOne({
        eventId: payload.eventId,
    });

    if (existingEvent) {
        return {
            created: false,
            duplicate: true,
            event: existingEvent,
        };
    }

    const event = await CustomerDiscoveryEvent.create({
        shopDomain: payload.shopDomain,
        clientId: payload.clientId,
        sessionId: payload.sessionId,
        eventId: payload.eventId,
        eventType: payload.eventType,
        occurredAt: new Date(payload.occurredAt),

        searchQuery: payload.searchQuery || null,

        collectionId: payload.collectionId || null,
        collectionTitle: payload.collectionTitle || null,

        productId: payload.productId || null,
        productTitle: payload.productTitle || null,
        variantId: payload.variantId || null,

        cartToken: payload.cartToken || null,
        checkoutId: payload.checkoutId || null,
        orderId: payload.orderId || null,

        metadata: payload.metadata || {},
    });

    return {
        created: true,
        duplicate: false,
        event,
    };
}

export default {
    getOverview,
    saveEvent,
    buildJourneys,
    calculateJourneyMetrics,
};