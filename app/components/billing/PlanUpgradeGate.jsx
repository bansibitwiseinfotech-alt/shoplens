import PropTypes from "prop-types";
import {
  Card,
  BlockStack,
  Text,
  Button,
  Box,
  Icon,
} from "@shopify/polaris";
import { LockIcon } from "@shopify/polaris-icons";

/**
 * PlanUpgradeGate
 * Reusable 100% pure Polaris paywall card shown when a merchant
 * attempts to access a feature not included in their current plan.
 */
export default function PlanUpgradeGate({
  plan = "premium",
  title,
  description,
  buttonText = "Upgrade Plan →",
}) {
  const planLabel = plan?.toLowerCase() === "pro" ? "Pro" : "Premium";
  const displayTitle = title || `${planLabel} Feature`;
  const displayDesc =
    description || `Upgrade to ${planLabel} to unlock this feature.`;

  return (
    <Card roundedAbove="sm">
      <Box padding="1600">
        <BlockStack align="center" inlineAlign="center" gap="400">
          {/* Lock icon inside soft yellow/amber circle */}
          <Box
            background="bg-surface-caution"
            borderRadius="full"
            padding="400"
          >
            <Icon source={LockIcon} tone="caution" />
          </Box>

          {/* Feature Tier Heading */}
          <Text variant="headingLg" as="h2" alignment="center" fontWeight="bold">
            {displayTitle}
          </Text>

          {/* Subtitle / Upgrade Notice */}
          <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
            {displayDesc}
          </Text>

          {/* Action Button */}
          <Box paddingBlockStart="200">
            <Button
              variant="primary"
              size="large"
              url="/app/billing"
            >
              {buttonText}
            </Button>
          </Box>
        </BlockStack>
      </Box>
    </Card>
  );
}

PlanUpgradeGate.propTypes = {
  plan: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  buttonText: PropTypes.string,
};
