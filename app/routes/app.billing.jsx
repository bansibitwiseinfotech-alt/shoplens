import { useCallback, useEffect, useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import {
  Page,
  InlineGrid,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Banner,
  Button,
  ButtonGroup,
  Card,
  Box,
  Modal,
  Divider,
  Link,
  SkeletonBodyText,
  SkeletonDisplayText,
  useBreakpoints,
} from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import {
  getBillingPlans,
  getCurrentSubscription,
  subscribeToPlan,
  confirmSubscription,
  cancelSubscription,
  getBillingUsage,
} from "../services/billingApi.js";

import PricingCard from "../components/billing/PricingCard.jsx";
import PlanComparisonTable from "../components/billing/PlanComparisonTable.jsx";
import PrivacyPolicyModal from "../components/billing/PrivacyPolicyModal.jsx";
import TermsModal from "../components/billing/TermsModal.jsx";
import ContactSupportModal from "../components/billing/ContactSupportModal.jsx";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    return {
      shop: session?.shop || "promobile-hub.myshopify.com",
    };
  } catch {
    return {
      shop: "promobile-hub.myshopify.com",
    };
  }
};

export default function BillingPage() {
  const { shop } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const { smDown, mdDown } = useBreakpoints();
  const [isClientMobile, setIsClientMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsClientMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const isMobile = smDown || mdDown || isClientMobile;

  // State
  const [interval, setInterval] = useState("monthly");
  const [plans, setPlans] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [, setUsageData] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingPlanId, setSubmittingPlanId] = useState(null);

  const [errorBanner, setErrorBanner] = useState(null);
  const [successBanner, setSuccessBanner] = useState(null);

  // Downgrade confirmation modal state
  const [isDowngradeModalOpen, setIsDowngradeModalOpen] = useState(false);
  const [, setPendingDowngradePlan] = useState(null);

  // Policy, Terms & Support modal states
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  /**
   * Load all billing data from backend APIs.
   */
  const loadBillingData = useCallback(async () => {
    setIsLoading(true);
    setErrorBanner(null);

    try {
      const chargeId = searchParams.get("charge_id") || searchParams.get("chargeId");
      const billingStatus = searchParams.get("billing_status");

      // 1. Fetch available plans
      const plansData = await getBillingPlans(shop);
      setPlans(plansData.plans || {});

      // 2. Fetch or verify current subscription
      let subData;
      if (chargeId || billingStatus === "approved") {
        try {
          subData = await confirmSubscription(shop, { chargeId });
          setSuccessBanner("Your subscription has been activated successfully!");
          // Clean URL parameters
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete("charge_id");
          nextParams.delete("chargeId");
          nextParams.delete("billing_status");
          setSearchParams(nextParams, { replace: true });
        } catch {
          subData = await getCurrentSubscription(shop, { chargeId });
        }
      } else {
        subData = await getCurrentSubscription(shop);
      }

      setSubscription(subData);

      // Default the billing interval to the merchant's current interval if subscribed to paid
      if (subData?.interval && subData.isPaid) {
        setInterval(subData.interval);
      }

      // 3. Fetch current usage
      const usageRes = await getBillingUsage(shop);
      setUsageData(usageRes);
    } catch (err) {
      console.error("[BillingPage] Failed to load billing data:", err);
      setErrorBanner(
        err.message || "Failed to load billing information. Please check that the backend is running."
      );
    } finally {
      setIsLoading(false);
    }
  }, [shop, searchParams, setSearchParams]);

  useEffect(() => {
    loadBillingData();
  }, [loadBillingData]);

  /**
   * Handle Plan Selection (Free, Pro, or Premium).
   */
  const handleSelectPlan = async (selectedPlanId, selectedInterval) => {
    setErrorBanner(null);
    setSuccessBanner(null);

    const currentPlanId = subscription?.plan || "free";

    // If downgrading to Free from a paid plan, ask for confirmation
    if (selectedPlanId === "free" && currentPlanId !== "free") {
      setPendingDowngradePlan({ plan: "free", interval: selectedInterval });
      setIsDowngradeModalOpen(true);
      return;
    }

    // Execute subscription creation
    await executeSubscription(selectedPlanId, selectedInterval);
  };

  /**
   * Executes the API subscription call.
   */
  const executeSubscription = async (targetPlanId, targetInterval) => {
    setIsSubmitting(true);
    setSubmittingPlanId(targetPlanId);

    try {
      const returnUrl = `${window.location.origin}/app/billing?shop=${encodeURIComponent(
        shop
      )}&billing_status=approved`;

      const result = await subscribeToPlan(shop, {
        plan: targetPlanId,
        interval: targetInterval,
        returnUrl,
      });

      if (targetPlanId === "free") {
        setSuccessBanner("Your store has been switched to the Free plan.");
        await loadBillingData();
      } else if (result?.confirmationUrl) {
        // Redirect merchant to Shopify's charge approval screen
        const redirectUrl = result.confirmationUrl;

        try {
          if (window.shopify?.navigation?.navigate) {
            window.shopify.navigation.navigate(redirectUrl);
            return;
          }
        } catch (bridgeErr) {
          console.warn("[BillingPage] App Bridge navigation warning:", bridgeErr);
        }

        try {
          if (window.top) {
            window.open(redirectUrl, "_top");
            return;
          }
        } catch (openErr) {
          console.warn("[BillingPage] window.open _top warning:", openErr);
        }

        try {
          window.top.location.href = redirectUrl;
        } catch {
          window.location.href = redirectUrl;
        }
        return; // Prevent resetting submitting state while redirecting
      } else if (result?.subscription?.status === "ACTIVE") {
        setSuccessBanner(`Your ${result.subscription.planName} plan is now active!`);
        await loadBillingData();
      }
    } catch (err) {
      console.error("[BillingPage] Subscription failed:", err);
      setErrorBanner(err.message || "Failed to initiate subscription. Please try again.");
    } finally {
      setIsSubmitting(false);
      setSubmittingPlanId(null);
    }
  };

  /**
   * Execute downgrade to Free after modal confirmation.
   */
  const handleConfirmDowngrade = async () => {
    setIsDowngradeModalOpen(false);
    setIsSubmitting(true);
    setSubmittingPlanId("free");

    try {
      const result = await cancelSubscription(shop, {
        prorate: true,
        reason: "Merchant opted for Free plan downgrade",
      });

      setSuccessBanner(result?.message || "Successfully downgraded to the Free plan.");
      await loadBillingData();
    } catch (err) {
      console.error("[BillingPage] Downgrade failed:", err);
      setErrorBanner(err.message || "Failed to downgrade plan. Please try again.");
    } finally {
      setIsSubmitting(false);
      setSubmittingPlanId(null);
      setPendingDowngradePlan(null);
    }
  };

  const currentPlanId = subscription?.status === "ACTIVE" ? subscription?.plan : "free";
  const currentInterval = subscription?.interval || "monthly";

  const freePlan = plans?.free || {
    id: "free",
    name: "Free",
    description: "Core search intelligence and discoverability analytics for growing stores.",
    pricing: { monthly: { amount: 0 }, yearly: { amount: 0 } },
    displayFeatures: [
      "Search Intelligence (Up to 20 products)",
      "Search Intelligence Trends (Up to 20 trends)",
      "Product Discoverability (Up to 20 products)",
      "Zero-Result Search (Up to 20 unique queries)",
    ],
  };

  const proPlan = plans?.pro || {
    id: "pro",
    name: "Pro",
    description: "Expanded limits and intelligence tools for scaling Shopify merchants.",
    pricing: { monthly: { amount: 19 }, yearly: { amount: 190 } },
    displayFeatures: [
      "Search Intelligence (Up to 50 products)",
      "Search Intelligence Trends (Up to 50 trends)",
      "Product Discoverability (Up to 50 products)",
      "Zero-Result Search (Up to 50 unique queries)",
      "Collection Merchandising",
      "Search Intent Analyzer",
      "Trending Search",
    ],
  };

  const premiumPlan = plans?.premium || {
    id: "premium",
    name: "Premium",
    description: "Full suite of automated merchandising, simulation,  insights, and unlimited analytics.",
    pricing: { monthly: { amount: 49 }, yearly: { amount: 490 } },
    displayFeatures: [
      "Search Intelligence (more than 200 products)",
      "Search Intelligence Trends (more than 200 trends)",
      "Product Discoverability (more than 200 products)",
      "Zero-Result Search (more than 200 queries)",
      "Merchandising Recommendations",
      "Smart Merchandising Rules",
      "Collection Merchandising",
      "Merchandising Simulator",
      "Search Intent Analyzer",
      "Customer Discovery",
      "Trending Search",
    ],
  };

  return (
    <Page
      fullWidth
      title="Billing & Plans"
      subtitle="Manage your ShopLens subscription and unlock more product discovery insights."
    >
      <Box
        paddingInline={{ xs: "300", sm: "400", md: "600" }}
        paddingBlockStart={{ xs: "300", sm: "400" }}
        paddingBlockEnd={{ xs: "400", sm: "500" }}
      >
        <BlockStack gap={{ xs: "300", sm: "400" }}>
          {/* Alerts & Notifications */}
          {errorBanner && (
            <Banner
              title="Billing Error"
              tone="critical"
              onDismiss={() => setErrorBanner(null)}
            >
              <p>{errorBanner}</p>
            </Banner>
          )}

          {successBanner && (
            <Banner
              title="Subscription Updated"
              tone="success"
              onDismiss={() => setSuccessBanner(null)}
            >
              <p>{successBanner}</p>
            </Banner>
          )}

          {/* Top Controls: Billing Interval Toggle & Status Callout */}
          <Card roundedAbove="sm" padding="400">
            {isMobile ? (
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm" as="span" fontWeight="semibold">
                    Billing Cycle
                  </Text>
                  <InlineStack gap="150" blockAlign="center">
                    <Text variant="bodyXs" tone="subdued">
                      Active:
                    </Text>
                    <Badge tone={currentPlanId === "free" ? "attention" : "success"}>
                      {subscription?.planName || currentPlanId.toUpperCase()}
                    </Badge>
                  </InlineStack>
                </InlineStack>

                <ButtonGroup variant="segmented" fullWidth>
                  <Button
                    pressed={interval === "monthly"}
                    onClick={() => setInterval("monthly")}
                  >
                    Monthly
                  </Button>
                  <Button
                    pressed={interval === "yearly"}
                    onClick={() => setInterval("yearly")}
                  >
                    Yearly (Save up to 17%)
                  </Button>
                </ButtonGroup>
              </BlockStack>
            ) : (
              <InlineStack align="space-between" blockAlign="center" wrap>
                <InlineStack gap="300" blockAlign="center">
                  <Text variant="headingSm" as="span" fontWeight="semibold">
                    Billing Cycle:
                  </Text>

                  <ButtonGroup variant="segmented">
                    <Button
                      pressed={interval === "monthly"}
                      onClick={() => setInterval("monthly")}
                    >
                      Monthly
                    </Button>
                    <Button
                      pressed={interval === "yearly"}
                      onClick={() => setInterval("yearly")}
                    >
                      Yearly (Save up to 17%)
                    </Button>
                  </ButtonGroup>
                </InlineStack>

                <InlineStack gap="200" blockAlign="center">
                  <Text variant="bodySm" tone="subdued">
                    Current active plan:
                  </Text>
                  <Badge tone={currentPlanId === "free" ? "attention" : "success"}>
                    {subscription?.planName || currentPlanId.toUpperCase()}
                  </Badge>
                </InlineStack>
              </InlineStack>
            )}
          </Card>

        {/* Loading Skeletons */}
        {isLoading && (
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            {[6, 8, 10].map((lines, i) => (
              <Card key={i} roundedAbove="sm">
                <Box minHeight="580px">
                  <BlockStack gap="400">
                    <SkeletonDisplayText size="medium" />
                    <SkeletonBodyText lines={lines} />
                  </BlockStack>
                </Box>
              </Card>
            ))}
          </InlineGrid>
        )}

        {/* Pricing Cards */}
        {!isLoading && (
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            <PricingCard
              plan={freePlan}
              interval={interval}
              currentPlanId={currentPlanId}
              currentInterval={currentInterval}
              isCurrent={currentPlanId === "free"}
              isRecommended={false}
              isLoading={isSubmitting && submittingPlanId === "free"}
              isDisabled={isSubmitting}
              onSelectPlan={handleSelectPlan}
            />

            <PricingCard
              plan={proPlan}
              interval={interval}
              currentPlanId={currentPlanId}
              currentInterval={currentInterval}
              isCurrent={currentPlanId === "pro"}
              isRecommended={false}
              isLoading={isSubmitting && submittingPlanId === "pro"}
              isDisabled={isSubmitting}
              onSelectPlan={handleSelectPlan}
            />

            <PricingCard
              plan={premiumPlan}
              interval={interval}
              currentPlanId={currentPlanId}
              currentInterval={currentInterval}
              isCurrent={currentPlanId === "premium"}
              isRecommended={true}
              isLoading={isSubmitting && submittingPlanId === "premium"}
              isDisabled={isSubmitting}
              onSelectPlan={handleSelectPlan}
            />
          </InlineGrid>
        )}

        {/* Feature & Limits Comparison Table */}
        {!isLoading && (
          <PlanComparisonTable
            currentPlanId={currentPlanId}
            interval={interval}
          />
        )}

        {/* Page Footer */}
        <Box paddingBlockStart="400" paddingBlockEnd={{ xs: "300", sm: "400" }}>
          <BlockStack gap="300">
            <Divider />
            {isMobile ? (
              /* Mobile: stacked layout — copyright top, links centered below */
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued" alignment="center" as="p">
                  © 2026{" "}
                  <Text variant="bodySm" fontWeight="bold" as="span">
                    ShopLens
                  </Text>
                  . All rights reserved.
                </Text>
                <Text variant="bodyXs" tone="subdued" alignment="center" as="p">
                  Managed via Shopify Billing.
                </Text>
                <InlineStack align="center" gap="300" wrap>
                  <Link
                    onClick={() => setIsPrivacyModalOpen(true)}
                    removeUnderline={false}
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    onClick={() => setIsTermsModalOpen(true)}
                    removeUnderline={false}
                  >
                    Terms &amp; Conditions
                  </Link>
                  <Link
                    onClick={() => setIsSupportModalOpen(true)}
                    removeUnderline={false}
                  >
                    Contact Support
                  </Link>
                </InlineStack>
              </BlockStack>
            ) : (
              /* Desktop: copyright left, links right */
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text variant="bodySm" tone="subdued" as="span">
                  © 2026{" "}
                  <Text variant="bodySm" fontWeight="bold" as="span">
                    ShopLens
                  </Text>
                  . All rights reserved. Managed via Shopify Billing.
                </Text>

                <InlineStack gap="200" blockAlign="center">
                  <Link
                    onClick={() => setIsPrivacyModalOpen(true)}
                    removeUnderline={false}
                  >
                    Privacy Policy
                  </Link>
                  <Text variant="bodySm" tone="subdued" as="span">
                    •
                  </Text>
                  <Link
                    onClick={() => setIsTermsModalOpen(true)}
                    removeUnderline={false}
                  >
                    Terms &amp; Conditions
                  </Link>
                  <Text variant="bodySm" tone="subdued" as="span">
                    •
                  </Text>
                  <Link
                    onClick={() => setIsSupportModalOpen(true)}
                    removeUnderline={false}
                  >
                    Contact Support
                  </Link>
                </InlineStack>
              </InlineStack>
            )}
          </BlockStack>
        </Box>
      </BlockStack>
    </Box>

      {/* Downgrade Confirmation Modal */}
      <Modal
        open={isDowngradeModalOpen}
        onClose={() => setIsDowngradeModalOpen(false)}
        title="Downgrade to Free Plan?"
        primaryAction={{
          content: "Confirm Downgrade",
          destructive: true,
          loading: isSubmitting,
          onAction: handleConfirmDowngrade,
        }}
        secondaryActions={[
          {
            content: "Keep Current Plan",
            onAction: () => setIsDowngradeModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Downgrading to the <strong>Free</strong> plan will immediately restrict your store to basic analytics:
            </Text>

            <Box paddingInlineStart="400">
              <BlockStack gap="100">
                <Text as="p" tone="subdued">• Search Intelligence: limited to 5 products</Text>
                <Text as="p" tone="subdued">• Search Intelligence Trends: limited to 5 trends</Text>
                <Text as="p" tone="subdued">• Product Discoverability: limited to 5 products</Text>
                <Text as="p" tone="subdued">• Zero-Result Search: limited to 5 unique queries</Text>
                <Text as="p" tone="subdued">• Advanced merchandising tools & recommendations will be locked</Text>
              </BlockStack>
            </Box>

            <Text as="p">
              Your recurring Shopify charge will be cancelled and prorated by Shopify. You can upgrade again at any time.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal
        open={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />

      {/* Terms & Conditions Modal */}
      <TermsModal
        open={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
      />

      {/* Contact Support Modal */}
      <ContactSupportModal
        open={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        shop={shop}
      />
    </Page>
  );
}
