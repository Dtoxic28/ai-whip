import { test } from "node:test";
import assert from "node:assert/strict";
import { sum } from "../sum.js";
test("adds positive numbers", () => assert.equal(sum(2, 3), 5));
test("adds negative numbers", () => assert.equal(sum(-2, -3), -5));
test("handles zero", () => assert.equal(sum(0, 4), 4));
