import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateOpportunityScore } from "../utils/opportunityScore.js";

describe("Opportunity Score Standardized Calculation (Single Canonical Source)", () => {
    describe("Acceptance Criteria Examples", () => {
        it("Acceptance Criteria 1: 'vivoapple iphone 11 pro' → 15", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 1,
                isRecurring: false,
                uniqueCustomers: 0,
            });

            assert.deepEqual(result, {
                demandScore: 10,
                activeDaysBonus: 5,
                recurrenceBonus: 0,
                uniqueCustomerBonus: 0,
                finalScore: 15,
            });
            assert.equal(result.finalScore, 15);
        });

        it("Acceptance Criteria 2: 'ggggggg' → 60", () => {
            const result = calculateOpportunityScore({
                searches: 3,
                activeDays: 2,
                isRecurring: true,                
                uniqueCustomers: 0,
            });

            assert.deepEqual(result, {
                demandScore: 30,
                activeDaysBonus: 10,
                recurrenceBonus: 20,
                uniqueCustomerBonus: 0,
                finalScore: 60,
            });
            assert.equal(result.finalScore, 60);
        });
    });

    describe("Search Volume Variations (0, 1, 2, 3, 6, 10, 100 searches)", () => {
        it("0 searches gives demandScore = 0", () => {
            const result = calculateOpportunityScore({
                searches: 0,
                activeDays: 0,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.demandScore, 0);
            assert.equal(result.finalScore, 0);
        });

        it("1 search gives demandScore = 10", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 0,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.demandScore, 10);
            assert.equal(result.finalScore, 10);
        });

        it("2 searches gives demandScore = 20", () => {
            const result = calculateOpportunityScore({
                searches: 2,
                activeDays: 0,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.demandScore, 20);
            assert.equal(result.finalScore, 20);
        });

        it("3 searches gives demandScore = 30", () => {
            const result = calculateOpportunityScore({
                searches: 3,
                activeDays: 0,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.demandScore, 30);
            assert.equal(result.finalScore, 30);
        });

        it("6 searches hits demandScore cap of 60", () => {
            const result = calculateOpportunityScore({
                searches: 6,
                activeDays: 0,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.demandScore, 60);
            assert.equal(result.finalScore, 60);
        });

        it("10 searches stays capped at demandScore = 60", () => {
            const result = calculateOpportunityScore({
                searches: 10,
                activeDays: 0,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.demandScore, 60);
            assert.equal(result.finalScore, 60);
        });

        it("100 searches stays capped at demandScore = 60", () => {
            const result = calculateOpportunityScore({
                searches: 100,
                activeDays: 0,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.demandScore, 60);
            assert.equal(result.finalScore, 60);
        });
    });

    describe("Active-Days Variations (1, 2, 3+ active days)", () => {
        it("1 active day gives activeDaysBonus = 5", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 1,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.activeDaysBonus, 5);
            assert.equal(result.finalScore, 15);
        });

        it("2 active days gives activeDaysBonus = 10", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 2,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.activeDaysBonus, 10);
            assert.equal(result.finalScore, 20);
        });

        it("3+ active days hits activeDaysBonus cap of 15", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 5,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.activeDaysBonus, 15);
            assert.equal(result.finalScore, 25);
        });
    });

    describe("Recurrence Bonus (one-off vs recurring)", () => {
        it("one-off gives recurrenceBonus = 0", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 1,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.recurrenceBonus, 0);
            assert.equal(result.finalScore, 15);
        });

        it("recurring gives recurrenceBonus = 20", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 1,
                isRecurring: true,
                uniqueCustomers: 0,
            });
            assert.equal(result.recurrenceBonus, 20);
            assert.equal(result.finalScore, 35);
        });
    });

    describe("Unique-Customer Variations (0, 1, 2+ customers)", () => {
        it("0 unique customers gives uniqueCustomerBonus = 0", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 1,
                isRecurring: false,
                uniqueCustomers: 0,
            });
            assert.equal(result.uniqueCustomerBonus, 0);
            assert.equal(result.finalScore, 15);
        });

        it("1 unique customer gives uniqueCustomerBonus = 0", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 1,
                isRecurring: false,
                uniqueCustomers: 1,
            });
            assert.equal(result.uniqueCustomerBonus, 0);
            assert.equal(result.finalScore, 15);
        });

        it("2+ unique customers gives uniqueCustomerBonus = 5", () => {
            const result = calculateOpportunityScore({
                searches: 1,
                activeDays: 1,
                isRecurring: false,
                uniqueCustomers: 2,
            });
            assert.equal(result.uniqueCustomerBonus, 5);
            assert.equal(result.finalScore, 20);
        });
    });

    describe("Boundary & Clamping Validations", () => {
        it("Maximum score with max search demand, max active days, recurring, and 2+ customers = 100", () => {
            // demandScore: 60, activeDaysBonus: 15, recurrenceBonus: 20, uniqueCustomerBonus: 5 = 100
            const result = calculateOpportunityScore({
                searches: 100,
                activeDays: 10,
                isRecurring: true,
                uniqueCustomers: 50,
            });

            assert.deepEqual(result, {
                demandScore: 60,
                activeDaysBonus: 15,
                recurrenceBonus: 20,
                uniqueCustomerBonus: 5,
                finalScore: 100,
            });
            assert.equal(result.finalScore, 100);
        });

        it("Score never exceeds 100 under extreme traffic outliers", () => {
            const result = calculateOpportunityScore({
                searches: 100000,
                activeDays: 365,
                isRecurring: true,
                uniqueCustomers: 50000,
            });

            assert.equal(result.finalScore, 100);
            assert.ok(result.finalScore <= 100);
        });

        it("Deterministic behavior: identical inputs always yield identical scores", () => {
            const runA = calculateOpportunityScore({ searches: 4, activeDays: 2, isRecurring: true, uniqueCustomers: 3 });
            const runB = calculateOpportunityScore({ searches: 4, activeDays: 2, isRecurring: true, uniqueCustomers: 3 });
            assert.deepEqual(runA, runB);
        });
    });
});
