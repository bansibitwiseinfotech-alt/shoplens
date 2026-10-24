import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Card,
  Box,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  Divider,
  Button,
  useBreakpoints,
} from "@shopify/polaris";

export function PricingCard({
  plan,
  interval = "monthly",
  currentPlanId = "free",
  currentInterval = "monthly",
  isCurrent = false,
  isRecommended = false,
  isLoading = false,
  isDisabled = false,
  onSelectPlan,
}) {
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

  const isMonthly = interval === "monthly";
  const pricing = plan?.pricing?.[interval] || { amount: 0, currencyCode: "USD" };
  const priceAmount = pricing.amount;

  // Determine annual savings display
  let savingsText = null;
  if (!isMonthly) {
    if (plan.id === "pro") savingsText = "Save $38/year";
    if (plan.id === "premium") savingsText = "Save $98/year";
  }

  // Button text and variant determination
  let buttonLabel = "Select Plan";
  let buttonVariant = undefined;

  if (isCurrent && (!plan.id || plan.id === "free" || currentInterval === interval)) {
    buttonLabel = "Current Plan";
  } else if (plan.id === "free") {
    buttonLabel = currentPlanId === "free" ? "Current Plan" : "Downgrade to Free";
  } else if (plan.id === "pro") {
    if (currentPlanId === "free") {
      buttonLabel = "Upgrade to Pro";
      buttonVariant = "primary";
    } else if (currentPlanId === "pro") {
      buttonLabel = isCurrent ? "Current Plan" : `Switch to ${isMonthly ? "Monthly" : "Yearly"}`;
    } else {
      buttonLabel = "Switch to Pro";
    }
  } else if (plan.id === "premium") {
    if (currentPlanId === "premium") {
      buttonLabel = isCurrent ? "Current Plan" : `Switch to ${isMonthly ? "Monthly" : "Yearly"}`;
    } else {
      buttonLabel = "Upgrade to Premium";
      buttonVariant = "primary";
    }
  }

  const isCurrentActive = isCurrent && (plan.id === "free" || currentInterval === interval);

  return (
    <Card roundedAbove="sm" padding="400">
      <BlockStack gap="400">
        {/* Top Badges & Header */}
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text variant="headingLg" as="h2" fontWeight="bold">
            {plan.name}
          </Text>

          <InlineStack gap="150" blockAlign="center">
            {isRecommended && !isCurrentActive && (
              <Badge tone="magic">Popular</Badge>
            )}
            {isCurrentActive && (
              <Badge tone="success">✓ Current Plan</Badge>
            )}
          </InlineStack>
        </InlineStack>

        {/* Short Description */}
        <Box minHeight={isMobile ? undefined : "40px"}>
          <Text variant="bodySm" tone="subdued">
            {plan.description}
          </Text>
        </Box>

        {/* Price & Billing Interval */}
        <BlockStack gap="100">
          <InlineStack align="start" blockAlign="baseline" gap="100">
            <Text variant="heading2xl" as="p" fontWeight="bold">
              ${priceAmount}
            </Text>
            <Text variant="bodyMd" tone="subdued">
              {isMonthly ? "/month" : "/year"}
            </Text>
          </InlineStack>

          {/* Savings or Billing Callout */}
          <Box minHeight={isMobile ? undefined : "24px"}>
            {savingsText ? (
              <Badge tone="magic">{savingsText}</Badge>
            ) : plan.id === "free" ? (
              <Text variant="bodyXs" tone="subdued">
                Free Forever
              </Text>
            ) : (
              <Text variant="bodyXs" tone="subdued">
                {isMonthly ? "Billed every 30 days" : "Billed annually"}
              </Text>
            )}
          </Box>
        </BlockStack>

        <Divider />

        {/* Feature List */}
        <BlockStack gap="200">
          <Text variant="headingXs" as="h3" fontWeight="bold" tone="subdued">
            WHAT&apos;S INCLUDED
          </Text>

          <Box minHeight={isMobile ? undefined : "330px"}>
            <BlockStack gap="150">
              {(plan.displayFeatures || []).map((feature, idx) => (
                <InlineStack key={idx} gap="150" blockAlign="start" wrap={false}>
                  <Text variant="bodySm" tone="success" as="span">
                    ✓
                  </Text>
                  <Text variant="bodySm" as="p">
                    {feature}
                  </Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Box>
        </BlockStack>

        {/* Action Button Pinned to Bottom */}
        <Box paddingBlockStart="100">
          <Button
            variant={buttonVariant}
            fullWidth
            size={isMobile ? "medium" : "large"}
            disabled={isCurrentActive || isDisabled}
            loading={isLoading}
            onClick={() => onSelectPlan(plan.id, interval)}
          >
            {buttonLabel}
          </Button>
        </Box>
      </BlockStack>
    </Card>
  );
}

PricingCard.propTypes = {
  plan: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    pricing: PropTypes.object,
    displayFeatures: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  interval: PropTypes.oneOf(["monthly", "yearly"]),
  currentPlanId: PropTypes.string,
  currentInterval: PropTypes.string,
  isCurrent: PropTypes.bool,
  isRecommended: PropTypes.bool,
  isLoading: PropTypes.bool,
  isDisabled: PropTypes.bool,
  onSelectPlan: PropTypes.func.isRequired,
};

export default PricingCard;
