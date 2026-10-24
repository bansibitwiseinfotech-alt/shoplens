import { randomUUID } from "node:crypto";
import Store from "../models/Store.js";
import { syncShopData } from "./syncService.js";

const SYNC_INTERVAL_MS = 15 * 60 * 1000;

const SYNC_LOCK_MS = 14 * 60 * 1000;

let schedulerStarted = false;
let activeScheduledRun = null;

const executeScheduledSync = async () => {
    console.log(
        `[Scheduled Sync] Starting at ${new Date().toISOString()}`
    );

    try {
        /*
         * Find all installed Shopify stores.
         */
        const stores = await Store.find({
            installed: true,
            accessToken: { $exists: true, $ne: "" },
        }).select("shop reauthorizationRequired");

        if (!stores.length) {
            console.log("[Scheduled Sync] No installed stores found.");
            return;
        }

        console.log(
            `[Scheduled Sync] Found ${stores.length} installed store(s).`
        );

        for (const store of stores) {
            const shop = store.shop;
            let lockId = null;

            if (store.reauthorizationRequired) {
                console.warn(
                    `[Scheduled Sync] Skipping ${shop}; app reauthorization is required.`
                );
                continue;
            }

            try {
                /*
                 * Acquire a sync lock atomically.
                 *
                 * This prevents the same store from being synchronized
                 * by multiple scheduler executions at the same time.
                 */
                const lockUntil = new Date(
                    Date.now() + SYNC_LOCK_MS
                );
                lockId = randomUUID();

                const lockedStore = await Store.findOneAndUpdate(
                    {
                        shop,
                        installed: true,
                        $or: [
                            {
                                syncLockUntil: null,
                            },
                            {
                                syncLockUntil: {
                                    $lt: new Date(),
                                },
                            },
                        ],
                    },
                    {
                        $set: {
                            syncLockUntil: lockUntil,
                            syncLockId: lockId,
                        },
                    },
                    {
                        returnDocument: "after",
                    }
                );

                if (!lockedStore) {
                    console.log(
                        `[Scheduled Sync] Skipping ${shop} because another sync is already running.`
                    );

                    continue;
                }

                console.log(
                    `[Scheduled Sync] Syncing ${shop}...`
                );

                try {
                    const result = await syncShopData(shop);

                    console.log(
                        `[Scheduled Sync] Completed ${shop}`,
                        JSON.stringify(result)
                    );
                } finally {
                    /*
                     * Always release the lock if it was acquired.
                     */
                    if (lockId) {
                        await Store.findOneAndUpdate(
                            { shop, syncLockId: lockId },
                            {
                                $set: {
                                    syncLockUntil: null,
                                    syncLockId: null,
                                },
                            }
                        );
                    }
                }
            } catch (error) {
                console.error(
                    `[Scheduled Sync] Failed for ${shop}:`,
                    error.message
                );

                /*
                 * Make sure the lock does not remain permanently
                 * if an unexpected error occurs.
                 */
                const query = { shop };
                if (lockId) {
                    query.syncLockId = lockId;
                }

                await Store.findOneAndUpdate(
                    query,
                    {
                        $set: {
                            syncLockUntil: null,
                            syncLockId: null,
                            syncStatus: "failed",
                            syncError: error.message,
                        },
                    }
                );
            }
        }

        console.log(
            `[Scheduled Sync] Finished at ${new Date().toISOString()}`
        );
    } catch (error) {
        console.error(
            "[Scheduled Sync] Scheduler error:",
            error.message
        );
    }
};

    const runScheduledSync = async () => {
        if (activeScheduledRun) {
            console.log("[Scheduled Sync] Skipping overlapping scheduler run.");
            return activeScheduledRun;
        }

        activeScheduledRun = executeScheduledSync();
        try {
            return await activeScheduledRun;
        } finally {
            activeScheduledRun = null;
        }
    };

export const startScheduledSync = () => {
    if (schedulerStarted) {
        console.log("[Scheduled Sync] Scheduler already started.");
        return;
    }

    schedulerStarted = true;

    console.log(
        "[Scheduled Sync] Scheduler started."
    );

    console.log(
        "[Scheduled Sync] Interval: every 15 minutes."
    );

    /*
     * Run once after the server starts.
     *
     * This ensures existing stores are synchronized without
     * waiting 15 minutes for the first scheduled run.
     */
    setTimeout(() => {
        runScheduledSync();
    }, 10 * 1000);

    /*
     * Continue automatically every 15 minutes.
     */
    setInterval(() => {
        runScheduledSync();
    }, SYNC_INTERVAL_MS);
};

export default startScheduledSync;