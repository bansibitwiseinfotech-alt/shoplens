// app/routes/app._index.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoaderData } from "react-router";
import {
  Banner,
  Badge,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Divider,
  EmptyState,
  InlineGrid,
  InlineStack,
  Page,
  ProgressBar,
  Select,
  Text,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { getDashboardOverview } from "../../src/services/dashboardApi.js";

const DATE_RANGE_OPTIONS = [
  { label: "Last 7 days", value: "last7" },
  { label: "Last 30 days", value: "last30" },
  { label: "Last 90 days", value: "last90" },
  { label: "Last 12 months", value: "last365" },
];

const DAYS_BY_PRESET = {
  last7: 7,
  last30: 30,
  last90: 90,    
  last365: 365,
};

const POLARIS_INTENT_TONES = ["success", "highlight", "primary", "critical"];

const INTENT_TONE_BY_CATEGORY = {
  electronic: "success",
  transaction: "success",
  footwear: "highlight",
  navigat: "highlight",
  sport: "highlight",
  accessor: "primary",
  inform: "primary",
  beaut: "primary",
  cloth: "critical",
  apparel: "critical",
  commerc: "critical",
};

// Exact CSS variables matching Polaris ProgressBar indicator fills for each tone
const POLARIS_TONE_COLORS = {
  success: "var(--p-color-bg-fill-success, #047b5d)",
  highlight: "var(--p-color-bg-fill-info, #91d0ff)",
  primary: "var(--p-color-bg-fill-brand, #303030)",
  critical: "var(--p-color-bg-fill-critical, #c70a24)",
};

function getCategoryTone(categoryKey, index) {
  const normalized = String(categoryKey || "").toLowerCase();
  const matched = Object.keys(INTENT_TONE_BY_CATEGORY).find((key) =>
    normalized.includes(key)
  );
  if (matched) {
    return INTENT_TONE_BY_CATEGORY[matched];
  }
  return POLARIS_INTENT_TONES[index % POLARIS_INTENT_TONES.length];
}

function getCategoryColor(categoryKey, index) {
  const tone = getCategoryTone(categoryKey, index);
  return POLARIS_TONE_COLORS[tone] || POLARIS_TONE_COLORS.primary;
}



export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })
    : "—";
}

function formatPercentage(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? `${number.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })}%`
    : "—";
}

function getDateRange(datePreset) {
  const days = DAYS_BY_PRESET[datePreset] || 30;

  const to = new Date();
  to.setUTCHours(23, 59, 59, 999);

  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days + 1);
  from.setUTCHours(0, 0, 0, 0);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function isTodayUTC(date) {
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}

function getTrendBucket(point, granularity) {
  const date = new Date(`${point.date}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (granularity === "monthly") {
    const key = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
    ].join("-");

    const now = new Date();
    const isThisMonth =
      date.getUTCFullYear() === now.getUTCFullYear() &&
      date.getUTCMonth() === now.getUTCMonth();

    const monthName = date.toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    });

    return {
      key,
      label: isThisMonth ? "This month" : monthName,
      fullLabel: date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      monthDay: monthName,
      isThisMonth,
    };
  }

  if (granularity === "weekly") {
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
    const key = date.toISOString().slice(0, 10);

    const now = new Date();
    const currentMonday = new Date(now);
    const currentDaysSinceMonday = (now.getUTCDay() + 6) % 7;
    currentMonday.setUTCDate(now.getUTCDate() - currentDaysSinceMonday);
    const isThisWeek = key === currentMonday.toISOString().slice(0, 10);

    const monthDay = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

    return {
      key,
      label: isThisWeek ? "This week" : monthDay,
      fullLabel: isThisWeek ? `This week (${monthDay})` : `Week of ${monthDay}`,
      isThisWeek,
    };
  }

  // Daily
  const isToday = isTodayUTC(date);
  const weekday = date.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  const monthDay = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const shortDate = [
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");

  return {
    key: point.date,
    label: isToday ? "Today" : weekday,
    fullLabel: isToday ? `Today (${monthDay})` : `${weekday}, ${monthDay}`,
    weekday,
    monthDay,
    shortDate,
    isToday,
  };
}

function aggregateTrend(points, granularity) {
  const buckets = new Map();

  for (const point of points) {
    if (!point?.date) continue;

    const bucket = getTrendBucket(point, granularity);
    if (!bucket) continue;

    const current = buckets.get(bucket.key) || {
      ...bucket,
      searches: 0,
      clicks: 0,
    };

    current.searches += Number(point.searches) || 0;
    current.clicks += Number(point.clicks) || 0;

    buckets.set(bucket.key, current);
  }

  return [...buckets.values()].sort((a, b) =>
    a.key.localeCompare(b.key)
  );
}

// --------------------------------------------------
// KPI CARD
// --------------------------------------------------

function KpiCard({
  title,
  value,
  delta,
  deltaLabel,
  description,
}) {
  const hasDelta =
    delta !== null &&
    delta !== undefined &&
    delta !== "" &&
    Number.isFinite(Number(delta));

  const numericDelta = Number(delta);
  const deltaTone =
    numericDelta > 0
      ? "success"
      : numericDelta < 0
      ? "critical"
      : undefined;

  return (
    <Card padding={{ xs: "300", sm: "400" }}>
      <BlockStack gap="150">
        <Text as="span" variant="bodySm" tone="subdued" truncate>
          {title}
        </Text>

        <Text as="p" variant="headingLg">
          {formatNumber(value)}
        </Text>

        <Text as="p" variant="bodyXs" tone="subdued">
          {description}
        </Text>

        {hasDelta && (
          <BlockStack gap="050">
            <InlineStack gap="100" blockAlign="center">
              <Badge tone={deltaTone} size="small">
                {numericDelta > 0 ? `+${formatPercentage(delta)}` : formatPercentage(delta)}
              </Badge>
            </InlineStack>
            {deltaLabel && (
              <Text as="span" variant="bodyXs" tone="subdued">
                {deltaLabel}
              </Text>
            )}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

// --------------------------------------------------
// EMPTY STATE
// --------------------------------------------------

function SectionEmptyState({ heading, message }) {
  return (
    <EmptyState heading={heading} image="">
      <Text as="p" tone="subdued">
        {message}
      </Text>
    </EmptyState>
  );
}

// --------------------------------------------------
// SEARCH PERFORMANCE LINE CHART
// --------------------------------------------------

function SearchPerformanceChart({
  points,
  granularity,
  onGranularityChange,
  isLoading = false,
}) {
  const [visibleSeries, setVisibleSeries] = useState({
    searches: true,
    clicks: true,
  });
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  const chart = useMemo(() => {
    if (!points.length) return null;

    const width = 650;
    const height = 280;
    const left = 44;
    const right = 28;
    const top = 20;
    const bottom = 48;

    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;

    const dataMaximum = Math.max(
      1,
      ...points.flatMap((point) => [
        point.searches,
        point.clicks,
      ])
    );
    const rawStep = dataMaximum / 4;
    const stepMagnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalizedStep = rawStep / stepMagnitude;
    const stepSize =
      (normalizedStep <= 1
        ? 1
        : normalizedStep <= 2
          ? 2
          : normalizedStep <= 2.5
            ? 2.5
            : normalizedStep <= 5
              ? 5
              : 10) * stepMagnitude;
    const maximum = Math.ceil(dataMaximum / stepSize) * stepSize;
    const stepCount = Math.max(1, Math.round(maximum / stepSize));
    const tickValues = [];
    for (let i = stepCount; i >= 0; i--) {
      tickValues.push(i * stepSize);
    }

    const baselineY = top + plotHeight;

    const x = (index) =>
      points.length === 1
        ? left + plotWidth / 2
        : left + (index / (points.length - 1)) * plotWidth;

    const y = (value) =>
      baselineY - (value / maximum) * plotHeight;

    const searchPoints = points
      .map((point, index) => `${x(index)},${y(point.searches)}`)
      .join(" ");

    const clickPoints = points
      .map((point, index) => `${x(index)},${y(point.clicks)}`)
      .join(" ");

    const lastIdx = points.length - 1;
    const labelIndexes =
      points.length <= 10
        ? points.map((_, i) => i)
        : [
            ...new Set([
              0,
              Math.round(lastIdx * 0.2),
              Math.round(lastIdx * 0.4),
              Math.round(lastIdx * 0.6),
              Math.round(lastIdx * 0.8),
              lastIdx,
            ]),
          ];

    return {
      width,
      height,
      left,
      top,
      plotWidth,
      plotHeight,
      baselineY,
      maximum,
      tickValues,
      searchPoints,
      clickPoints,
      x,
      y,
      labelIndexes,
    };
  }, [points]);

  const handlePointer = useCallback(
    (clientX) => {
      if (!svgRef.current || !chart || !points.length) return;
      const rect = svgRef.current.getBoundingClientRect();
      if (!rect.width) return;
      const relativeX = (clientX - rect.left) / rect.width;
      const svgX = relativeX * chart.width;

      if (svgX < chart.left - 15 || svgX > chart.left + chart.plotWidth + 15) {
        setHoverIndex(null);
        return;
      }

      const ratio = Math.max(
        0,
        Math.min(1, (svgX - chart.left) / chart.plotWidth)
      );
      const closest = Math.round(ratio * (points.length - 1));
      setHoverIndex(closest);
    },
    [chart, points.length]
  );

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center" gap={{ xs: "200", sm: "300" }} wrap>
        <ButtonGroup variant="segmented">
          <Button
            pressed={visibleSeries.searches}
            onClick={() =>
              setVisibleSeries((previous) => {
                if (previous.searches && !previous.clicks) return previous;
                return {
                  ...previous,
                  searches: !previous.searches,
                };
              })
            }
            size="slim"
          >
            Searches
          </Button>

          <Button
            pressed={visibleSeries.clicks}
            onClick={() =>
              setVisibleSeries((previous) => {
                if (previous.clicks && !previous.searches) return previous;
                return {
                  ...previous,
                  clicks: !previous.clicks,
                };
              })
            }
            size="slim"
          >
            Product clicks
          </Button>
        </ButtonGroup>

        <ButtonGroup variant="segmented">
          {[
            { label: "Daily", value: "daily" },
            { label: "Weekly", value: "weekly" },
            { label: "Monthly", value: "monthly" },
          ].map((option) => (
            <Button
              key={option.value}
              pressed={granularity === option.value}
              size="slim"
              onClick={() => onGranularityChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </ButtonGroup>
      </InlineStack>

      {!points.length ? (
        <SectionEmptyState
          heading="No search activity yet"
          message="Search and click trends will appear when analytics events are recorded for this date range."
        />
      ) : (
        <>
          <Box width="100%" opacity={isLoading ? 0.6 : 1}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              width="100%"
              height="auto"
              role="img"
              aria-label="Searches and product clicks over time"
              onMouseMove={(e) => handlePointer(e.clientX)}
              onMouseLeave={() => setHoverIndex(null)}
              onTouchStart={(e) => {
                if (e.touches && e.touches[0]) handlePointer(e.touches[0].clientX);
              }}
              onTouchMove={(e) => {
                if (e.touches && e.touches[0]) handlePointer(e.touches[0].clientX);
              }}
              onTouchEnd={() => setHoverIndex(null)}
            >
              {/* Horizontal grid lines & Y labels */}
              {chart.tickValues.map((value) => {
                const y = chart.y(value);
                const isZero = value === 0;

                return (
                  <g key={value}>
                    {!isZero && (
                      <line
                        x1={chart.left}
                        y1={y}
                        x2={chart.left + chart.plotWidth}
                        y2={y}
                        stroke="currentColor"
                        strokeOpacity="0.08"
                        strokeDasharray="4 4"
                      />
                    )}

                    {/* Y-axis tick mark */}
                    <line
                      x1={chart.left - 4}
                      y1={y}
                      x2={chart.left}
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity="0.25"
                      strokeWidth="1"
                    />

                    {/* Y-axis value label */}
                    <text
                      x={chart.left - 8}
                      y={y + 4}
                      fontSize="11"
                      fill="currentColor"
                      opacity="0.75"
                      textAnchor="end"
                    >
                      {formatNumber(value)}
                    </text>
                  </g>
                );
              })}

              {/* Solid Y-axis line */}
              <line
                x1={chart.left}
                y1={chart.top}
                x2={chart.left}
                y2={chart.baselineY}
                stroke="currentColor"
                strokeOpacity="0.2"
                strokeWidth="1"
              />

              {/* Solid X-axis baseline line */}
              <line
                x1={chart.left}
                y1={chart.baselineY}
                x2={chart.left + chart.plotWidth}
                y2={chart.baselineY}
                stroke="currentColor"
                strokeOpacity="0.2"
                strokeWidth="1"
              />

              {/* Lines */}
              {visibleSeries.searches && (
                <polyline
                  points={chart.searchPoints}
                  fill="none"
                  stroke="#4263EB"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {visibleSeries.clicks && (
                <polyline
                  points={chart.clickPoints}
                  fill="none"
                  stroke="#16A34A"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Points: show on short day ranges (<= 10 points) or only on active hover for longer ranges */}
              {points.map((point, index) => {
                const isHovered = hoverIndex === index;
                const shouldShowPoint = points.length <= 10 || isHovered;
                if (!shouldShowPoint) return null;

                const r = isHovered ? 5.5 : 4;

                return (
                  <g key={point.key}>
                    {visibleSeries.searches && (
                      <circle
                        cx={chart.x(index)}
                        cy={chart.y(point.searches)}
                        r={r}
                        fill="#ffffff"
                        stroke="#4263EB"
                        strokeWidth={isHovered ? 2.5 : 2}
                      >
                        <title>
                          {point.fullLabel || point.label}: {formatNumber(point.searches)} searches
                        </title>
                      </circle>
                    )}
                    {visibleSeries.clicks && (
                      <circle
                        cx={chart.x(index)}
                        cy={chart.y(point.clicks)}
                        r={r}
                        fill="#ffffff"
                        stroke="#16A34A"
                        strokeWidth={isHovered ? 2.5 : 2}
                      >
                        <title>
                          {point.fullLabel || point.label}: {formatNumber(point.clicks)} product clicks
                        </title>
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* Active hover crosshair and tooltip */}
              {activePoint && hoverIndex !== null && (
                <g pointerEvents="none">
                  <line
                    x1={chart.x(hoverIndex)}
                    y1={chart.top}
                    x2={chart.x(hoverIndex)}
                    y2={chart.baselineY}
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeDasharray="3 3"
                  />

                  {(() => {
                    const hx = chart.x(hoverIndex);
                    const isRight = hx > chart.width - 165;
                    const tooltipX = isRight ? hx - 155 : hx + 12;
                    const tooltipY = Math.max(
                      chart.top,
                      Math.min(chart.y(activePoint.searches) - 30, chart.height - 90)
                    );

                    return (
                      <g>
                        <rect
                          x={tooltipX}
                          y={tooltipY}
                          width="145"
                          height="66"
                          rx="6"
                          fill="#1A1C1D"
                          opacity="0.94"
                        />
                        <text
                          x={tooltipX + 10}
                          y={tooltipY + 18}
                          fill="#ffffff"
                          fontSize="11"
                          fontWeight="600"
                        >
                          {activePoint.fullLabel || activePoint.label}
                        </text>
                        {visibleSeries.searches && (
                          <text
                            x={tooltipX + 10}
                            y={tooltipY + 36}
                            fill="#93C5FD"
                            fontSize="11"
                          >
                            ● {formatNumber(activePoint.searches)} searches
                          </text>
                        )}
                        {visibleSeries.clicks && (
                          <text
                            x={tooltipX + 10}
                            y={tooltipY + 52}
                            fill="#86EFAC"
                            fontSize="11"
                          >
                            ● {formatNumber(activePoint.clicks)} clicks
                          </text>
                        )}
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* X Axis vertical grid lines, tick marks & labels */}
              {chart.labelIndexes.map((index) => {
                const x = chart.x(index);
                const point = points[index];
                const isDaily = granularity === "daily";
                const isLast = index === points.length - 1;
                const isToday = isDaily && (isLast || point.isToday);

                return (
                  <g key={point.key}>
                    {/* Subtle vertical grid line */}
                    <line
                      x1={x}
                      y1={chart.top}
                      x2={x}
                      y2={chart.baselineY}
                      stroke="currentColor"
                      strokeOpacity="0.06"
                      strokeDasharray="3 3"
                    />

                    {/* X-axis tick mark */}
                    <line
                      x1={x}
                      y1={chart.baselineY}
                      x2={x}
                      y2={chart.baselineY + 4}
                      stroke="currentColor"
                      strokeOpacity="0.3"
                      strokeWidth="1"
                    />

                    {/* X-axis label */}
                    {isToday ? (
                      <g>
                        <rect
                          x={x - 22}
                          y={chart.baselineY + 6}
                          width="44"
                          height="28"
                          rx="4"
                          fill="#EAF7ED"
                          stroke="#92D8A4"
                          strokeWidth="1"
                        />
                        <text
                          x={x}
                          y={chart.baselineY + 18}
                          fontSize="10"
                          fontWeight="700"
                          fill="#126832"
                          textAnchor="middle"
                        >
                          Today
                        </text>
                        <text
                          x={x}
                          y={chart.baselineY + 29}
                          fontSize="9"
                          fontWeight="500"
                          fill="#126832"
                          textAnchor="middle"
                        >
                          {point.shortDate || point.monthDay}
                        </text>
                      </g>
                    ) : points.length <= 10 && isDaily ? (
                      <g>
                        <text
                          x={x}
                          y={chart.baselineY + 16}
                          fontSize="11"
                          fontWeight="600"
                          fill="currentColor"
                          opacity="0.9"
                          textAnchor="middle"
                        >
                          {point.weekday || point.label}
                        </text>
                        <text
                          x={x}
                          y={chart.baselineY + 28}
                          fontSize="10"
                          fill="currentColor"
                          opacity="0.6"
                          textAnchor="middle"
                        >
                          {formatNumber(point.searches)}{" "}
                          {point.searches === 1 ? "search" : "searches"}
                        </text>
                      </g>
                    ) : (
                      <text
                        x={x}
                        y={chart.baselineY + 18}
                        fontSize="11"
                        fill="currentColor"
                        opacity="0.8"
                        textAnchor={
                          index === 0
                            ? "start"
                            : isLast
                              ? "end"
                              : "middle"
                        }
                      >
                        {point.label || point.monthDay}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </Box>

          <Text as="p" variant="bodySm" tone="subdued">
            Showing {points.length} {granularity} {points.length === 1 ? "interval" : "intervals"} for the selected date range.
          </Text>
        </>
      )}
    </BlockStack>
  );
}

// --------------------------------------------------
// SEARCH INTENT BREAKDOWN & PIE CHART
// --------------------------------------------------

function getDonutArcPath(startAngle, endAngle, radius, center) {
  const toPoint = (angle) => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(radians),
      y: center + radius * Math.sin(radians),
    };
  };

  const start = toPoint(startAngle);
  const end = toPoint(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1`,
    `${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
  ].join(" ");
}

function SearchIntentChart({ categories, totalSearches }) {
  const chartData = useMemo(() => {
    const valid = (categories || [])
      .map((item, index) => ({
        ...item,
        count: Math.max(0, Number(item.count) || 0),
        color: getCategoryColor(item.id || item.name, index),
      }))
      .filter((item) => item.count > 0);

    const total = valid.reduce((sum, item) => sum + item.count, 0);

    let startAngle = -90;
    const items = valid.map((item, index) => {
      const endAngle =
        index === valid.length - 1
          ? 270
          : startAngle + (item.count / total) * 360;
      const segment = {
        ...item,
        percent: total ? (item.count / total) * 100 : 0,
        startAngle,
        endAngle,
      };
      startAngle = endAngle;
      return segment;
    });

    return { total, items };
  }, [categories]);

  if (!chartData.total) {
    return (
      <SectionEmptyState
        heading="No categorized searches"
        message="Search intent will appear after customer queries have been categorized by the backend."
      />
    );
  }

  const uncategorizedSearches = Math.max(
    0,
    (Number(totalSearches) || 0) - chartData.total
  );
  const center = 80;
  const radius = 58;
  const ringWidth = 18;

  return (
    <BlockStack gap="400">
      <InlineStack align="center">
        <Box width="100%" maxWidth="200px">
          <svg
            viewBox="0 0 160 160"
            width="100%"
            height="100%"
            role="img"
            aria-label={`Search intent distribution from ${formatNumber(chartData.total)} categorized searches`}
          >
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.1"
              strokeWidth={ringWidth}
            />

            {chartData.items.map((item, index) => {
              if (item.count === chartData.total) {
                return (
                  <circle
                    key={item.id || item.name || index}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={ringWidth}
                  >
                    <title>
                      {item.name}: {formatNumber(item.count)} searches (
                      {formatPercentage(item.percent)})
                    </title>
                  </circle>
                );
              }

              return (
                <path
                  key={item.id || item.name || index}
                  d={getDonutArcPath(
                    item.startAngle,
                    item.endAngle,
                    radius,
                    center
                  )}
                  stroke={item.color}
                  strokeWidth={ringWidth}
                  strokeLinecap="butt"
                  fill="none"
                >
                  <title>
                    {item.name}: {formatNumber(item.count)} searches (
                    {formatPercentage(item.percent)})
                  </title>
                </path>
              );
            })}

            <text
              x={center}
              y="70"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="21"
              fontWeight="700"
              fill="currentColor"
            >
              {formatNumber(chartData.total)}
            </text>

            <text
              x={center}
              y="92"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fill="currentColor"
              opacity="0.7"
            >
              Categorized
            </text>
          </svg>
        </Box>
      </InlineStack>

      <Text variant="bodySm" tone="subdued" alignment="center">
        {formatNumber(chartData.total)} of {formatNumber(totalSearches)} searches categorized
        {uncategorizedSearches > 0
          ? ` · ${formatNumber(uncategorizedSearches)} not yet categorized`
          : ""}
      </Text>

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">
          Intent breakdown
        </Text>

        <BlockStack gap="300">
          {chartData.items.map((item, index) => {
            const categoryTone = getCategoryTone(item.id || item.name, index);
            const clampedPercent = Math.min(
              100,
              Math.max(0, Number(item.percent) || 0)
            );
            const progressValue =
              clampedPercent > 0 ? Math.max(1, Math.round(clampedPercent)) : 0;

            return (
              <BlockStack key={item.id || item.name || index} gap="150">
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <Text as="span" variant="bodySm" fontWeight="medium">
                    {item.name || "Unclassified"}
                  </Text>

                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {formatNumber(item.count)}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {formatPercentage(item.percent)}
                    </Text>
                  </InlineStack>
                </InlineStack>

                <ProgressBar
                  progress={progressValue}
                  size="small"
                  tone={categoryTone}
                />
              </BlockStack>
            );
          })}
        </BlockStack>
      </BlockStack>
    </BlockStack>
  );
}



function getTrendBadgeTone(trendType) {
  if (trendType === "Rising") return "success";
  if (trendType === "New") return "info";
  if (trendType === "Seasonal") return "attention";
  return "neutral";
}

function InsightList({ items, emptyMessage, renderItem }) {
  if (!items.length) {
    return (
      <Text as="p" variant="bodySm" tone="subdued">
        {emptyMessage}
      </Text>
    );
  }

  return (
    <BlockStack gap="200">
      {items.map((item, index) => (
        <BlockStack key={item.key || index} gap="200">
          {renderItem(item)}
          {index < items.length - 1 && <Divider />}
        </BlockStack>
      ))}
    </BlockStack>
  );
}

function DashboardInsightsSection({ data }) {
  const topQueries = data.topSearchQueries || [];
  const zeroResults = data.zeroResults || {};
  const failedQueries = zeroResults.topFailedQueries || [];
  const trendingSearches = data.trendingSearches?.trends || [];
  const clickedProducts = data.topClickedProducts || [];
  const hardToFindProducts = data.discoverability?.products || [];
  const recommendations = data.recommendations || [];
  const visibleClickedProducts = clickedProducts.slice(0, 5);
  const maxClicks = Math.max(
    ...visibleClickedProducts.map((product) => Number(product.clicks) || 0),
    1
  );

  return (
    <BlockStack gap={{ xs: "300", sm: "400" }}>
      <BlockStack gap="100">
        <Text as="h2" variant="headingMd">
          ShopLens store insights
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          A quick look at what shoppers are searching for, clicking, and
          struggling to find.
        </Text>
      </BlockStack>

      <InlineGrid columns={{ xs: 1, md: 2 }} gap={{ xs: "300", sm: "400" }}>
        <Card padding={{ xs: "300", sm: "400" }}>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Top shopper searches
            </Text>
            <InsightList
              items={topQueries.slice(0, 3).map((query, index) => ({
                ...query,
                key: `${query.query}-${index}`,
              }))}
              emptyMessage="Search terms will appear when shoppers use store search."
              renderItem={(query) => (
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {query.displayQuery || query.query || "Search term"}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {formatNumber(query.searches)} searches ·{" "}
                      {formatNumber(query.clicks)} product clicks
                    </Text>
                  </BlockStack>
                </InlineStack>
              )}
            />
          </BlockStack>
        </Card>

        <Card padding={{ xs: "300", sm: "400" }}>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Search trends
            </Text>
            <InsightList
              items={trendingSearches.slice(0, 3).map((trend, index) => ({
                ...trend,
                key: `${trend.query}-${index}`,
              }))}
              emptyMessage="No growing search trends detected for this period."
              renderItem={(trend) => (
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {trend.query || "Search term"}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {formatNumber(trend.currentSearches)} searches
                    </Text>
                  </BlockStack>
                  <Badge tone={getTrendBadgeTone(trend.trendType)}>
                    {trend.trendType || "Trending"}
                  </Badge>
                </InlineStack>
              )}
            />
          </BlockStack>
        </Card>

        <Card padding={{ xs: "300", sm: "400" }}>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Products shoppers click
            </Text>
            {clickedProducts.length === 0 ? (
              <BlockStack gap="300">
                <Text as="p" variant="bodySm" tone="subdued">
                  Product click insights will appear as shoppers interact with
                  search results.
                </Text>
                <Divider />
                <Box
                  background="bg-surface-secondary"
                  padding="300"
                  borderRadius="200"
                >
                  <BlockStack gap="150">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                         How ShopLens Helps
                      </Text>
                      <Badge tone="info">ShopLens Intelligence</Badge>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      ShopLens tracks every shopper search click in real time. As
                      visitors browse and click search results, you will see
                      which products generate the highest interest and sales.
                    </Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <Text as="p" variant="bodySm" tone="subdued">
                  {formatNumber(
                    clickedProducts.reduce(
                      (total, product) => total + (Number(product.clicks) || 0),
                      0
                    )
                  )}{" "}
                  product clicks across {formatNumber(clickedProducts.length)}{" "}
                  products
                </Text>
                <BlockStack gap="300">
                  {visibleClickedProducts.map((product, index) => {
                    const clicks = Number(product.clicks) || 0;
                    const share = (clicks / maxClicks) * 100;

                    return (
                      <BlockStack
                        key={`${product.productId}-${index}`}
                        gap="100"
                      >
                        <InlineStack
                          align="space-between"
                          blockAlign="center"
                          gap="300"
                        >
                          <Text as="p" variant="bodySm" fontWeight="semibold">
                            {product.title || "Store product"}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {formatNumber(clicks)} clicks
                          </Text>
                        </InlineStack>
                        <ProgressBar
                          progress={Math.round(share)}
                          size="small"
                          tone="primary"
                        />
                      </BlockStack>
                    );
                  })}
                </BlockStack>

                <Divider />

                <Box
                  background="bg-surface-secondary"
                  padding="300"
                  borderRadius="200"
                >
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                       Merchant Conversion Tips
                      </Text>
                      <Badge tone="info">ShopLens Intelligence</Badge>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Shoppers clicking these products demonstrate strong purchase
                      intent. Take these quick actions to maximize sales:
                    </Text>
                    <BlockStack gap="100">
                      <InlineStack gap="100" blockAlign="start">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          • Merchandising:
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Feature top-clicked items in your homepage or &apos;Best
                          Sellers&apos; collections.
                        </Text>
                      </InlineStack>
                      <InlineStack gap="100" blockAlign="start">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          • Inventory:
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Ensure adequate stock for popular items to avoid lost
                          sales and bounces.
                        </Text>
                      </InlineStack>
                      <InlineStack gap="100" blockAlign="start">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          • Cross-sell:
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Bundle complementary accessories with these high-traffic
                          products.
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card padding={{ xs: "300", sm: "400" }}>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Opportunities and next steps
            </Text>
            {failedQueries.length > 0 && (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">
                  Searches with no results
                </Text>
                <InsightList
                  items={failedQueries.slice(0, 2).map((query, index) => ({
                    ...query,
                    key: `${query.query}-${index}`,
                  }))}
                  emptyMessage="No zero-result queries."
                  renderItem={(query) => (
                    <InlineStack
                      align="space-between"
                      blockAlign="center"
                      gap="300"
                    >
                      <Text as="p" variant="bodySm">
                        {query.query || "Search term"}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {formatNumber(query.searches)} searches
                      </Text>
                    </InlineStack>
                  )}
                />
              </BlockStack>
            )}
            {hardToFindProducts.length > 0 && (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">
                  Hard-to-find products
                </Text>
                <InsightList
                  items={hardToFindProducts.slice(0, 2).map((product, index) => ({
                    ...product,
                    key: `${product.productId}-${index}`,
                  }))}
                  emptyMessage="No products need discoverability improvements."
                  renderItem={(product) => (
                    <InlineStack
                      align="space-between"
                      blockAlign="center"
                      gap="300"
                    >
                      <Text as="p" variant="bodySm">
                        {product.title || "Store product"}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Score {formatNumber(product.score)}/100
                      </Text>
                    </InlineStack>
                  )}
                />
              </BlockStack>
            )}
            {failedQueries.length === 0 &&
              hardToFindProducts.length === 0 &&
              recommendations.length === 0 && (
                <Text as="p" variant="bodySm" tone="subdued">
                  No urgent opportunities detected for this period.
                </Text>
              )}
            {recommendations.slice(0, 2).map((recommendation, index) => (
              <BlockStack
                key={recommendation.id || `${recommendation.title}-${index}`}
                gap="100"
              >
                <Text as="p" variant="bodySm" fontWeight="semibold">
                  {recommendation.title || "Recommended action"}
                </Text>
                {recommendation.suggestedAction && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {recommendation.suggestedAction}
                  </Text>
                )}
              </BlockStack>
            ))}
          </BlockStack>
        </Card>
      </InlineGrid>
    </BlockStack>
  );
}

// --------------------------------------------------
// MAIN DASHBOARD
// --------------------------------------------------

export default function ShopLensDashboard() {
  const { shop } = useLoaderData();

  const [datePreset, setDatePreset] = useState("last30");
  const [trendGranularity, setTrendGranularity] = useState("daily");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const hasLoadedInitial = useRef(false);

  const loadDashboard = useCallback(
    async (isRefresh = false, signal) => {
      if (!shop) {
        setError("The authenticated Shopify store could not be determined.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh || hasLoadedInitial.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const range = getDateRange(datePreset);

        const result = await getDashboardOverview({
          shop,
          ...range,
          datePreset,
          signal,
        });

        if (!signal?.aborted) {
          setData(result);
          hasLoadedInitial.current = true;
        }
      } catch (requestError) {
        if (requestError.name !== "AbortError" && !signal?.aborted) {
          setError(
            requestError.message || "Failed to load dashboard analytics."
          );
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [datePreset, shop]
  );

  useEffect(() => {
    const controller = new AbortController();

    loadDashboard(false, controller.signal);

    return () => controller.abort();
  }, [loadDashboard]);

  const trendPoints = useMemo(
    () => aggregateTrend(data?.trend?.points || [], trendGranularity),
    [data?.trend?.points, trendGranularity]
  );

  const kpis = data?.kpis || {};
  const intentCategories = data?.searchIntent?.categories || [];

  return (
    <Page title="ShopLens Dashboard" fullWidth>
      <Box
        paddingInline={{ xs: "400", sm: "600", md: "700" }}
        paddingBlockStart="100"
        paddingBlockEnd={{ xs: "300", sm: "400" }}
      >
        <BlockStack gap={{ xs: "300", sm: "400" }}>
          {/* Header */}

        <InlineStack
          align="space-between"
          blockAlign="center"
          gap="300"
          wrap
        >
          <BlockStack gap="100">
            <Text as="p" variant="bodyMd" tone="subdued">
              Store search performance and product discovery
            </Text>

            {shop && (
              <InlineStack gap="150" blockAlign="center">
                <Badge tone="info" size="small">
                  {shop}
                </Badge>
              </InlineStack>
            )}
          </BlockStack>

          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <Select
              label="Date range"
              labelInline
              options={DATE_RANGE_OPTIONS}
              value={datePreset}
              onChange={(value) => {
                setDatePreset(value);
                setTrendGranularity(
                  value === "last365"
                    ? "monthly"
                    : value === "last90"
                      ? "weekly"
                      : "daily"
                );
                setError(null);
              }}
            />

            <Button
              onClick={() => loadDashboard(true)}
              loading={refreshing}
              disabled={loading}
            >
              Refresh
            </Button>
          </InlineStack>
        </InlineStack>

        {/* Errors */}

        {error && (
          <Banner
            title="Unable to load dashboard data"
            tone="critical"
            onDismiss={() => setError(null)}
          >
            <BlockStack gap="200">
              <Text as="p">{error}</Text>

              <InlineStack>
                <Button
                  onClick={() => loadDashboard(true)}
                  loading={refreshing}
                >
                  Try again
                </Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        )}

        {data ? (
          <BlockStack gap={{ xs: "300", sm: "400" }}>
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Search performance
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Shopper search activity and attributed outcomes for the
                selected date range.
              </Text>
            </BlockStack>

            <InlineGrid columns={{ xs: 2, sm: 2, md: 4, lg: 4 }} gap={{ xs: "300", sm: "400" }}>
              <KpiCard
                title="Search events"
                value={kpis.totalSearches?.value}
                delta={kpis.totalSearches?.delta}
                deltaLabel={kpis.totalSearches?.periodLabel}
                description="All recorded shopper searches"
              />

              <KpiCard
                title="Unique search terms"
                value={kpis.uniqueQueries?.value}
                delta={kpis.uniqueQueries?.delta}
                deltaLabel={kpis.uniqueQueries?.periodLabel}
                description="Different terms shoppers searched"
              />

              <KpiCard
                title="Product clicks"
                value={kpis.clicks?.value}
                delta={kpis.clicks?.delta}
                deltaLabel={kpis.clicks?.periodLabel}
                description="Clicks on products from search"
              />

              <KpiCard
                title="Purchases from search"
                value={kpis.conversions?.value}
                delta={kpis.conversions?.delta}
                deltaLabel={kpis.conversions?.periodLabel}
                description="Purchases attributed to search activity"
              />
            </InlineGrid>

            <InlineGrid columns={{ xs: 1, lg: 2 }} gap={{ xs: "300", sm: "400" }}>
              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Search Performance
                    </Text>

                    <Text as="p" variant="bodySm" tone="subdued">
                      Compare searches and product clicks across the selected
                      interval.
                    </Text>
                  </BlockStack>

                  <SearchPerformanceChart
                    points={trendPoints}
                    granularity={trendGranularity}
                    onGranularityChange={(granularity) => {
                      setTrendGranularity(granularity);
                    }}
                    isLoading={refreshing}
                  />
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Search Intent
                    </Text>

                    <Text as="p" variant="bodySm" tone="subdued">
                      Search categories based on shopper queries in this
                      period.
                    </Text>
                  </BlockStack>

                  <SearchIntentChart
                    categories={intentCategories}
                    totalSearches={kpis.totalSearches?.value}
                  />
                </BlockStack>
              </Card>
            </InlineGrid>

          </BlockStack>
        ) : !loading ? (
          <Card>
            <EmptyState heading="Dashboard data is unavailable" image="">
              <BlockStack gap="200">
                <Text as="p" tone="subdued">
                  Check your dashboard API and store analytics, then try again.
                </Text>

                <InlineStack align="center">
                  <Button
                    onClick={() => loadDashboard(true)}
                    loading={refreshing}
                  >
                    Try again
                  </Button>
                </InlineStack>
              </BlockStack>
            </EmptyState>
          </Card>
        ) : null}

        {data && <DashboardInsightsSection data={data} />}
      </BlockStack>
    </Box>
  </Page>
  );
}