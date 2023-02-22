import { allSettled, createEvent, createStore, fork } from "effector";
import { createInstance, type i18n } from "i18next";
import { describe, expect, test } from "vitest";

import { createI18nextIntegration } from "./integration";

describe("integration.$t", () => {
  test("returns identity function while not initialized", async () => {
    const setup = createEvent();

    const { $t } = createI18nextIntegration({
      instance: createStore<i18n | null>(null),
      setup,
    });

    const $result = $t.map((t) => t("common:foo"));

    const scope = fork();

    expect(scope.getState($result)).toBe("common:foo");
  });

  test("returns identity function while initialized without instance", async () => {
    const setup = createEvent();

    const { $t } = createI18nextIntegration({
      instance: createStore<i18n | null>(null),
      setup,
    });

    const $result = $t.map((t) => t("common:foo"));

    const scope = fork();

    await allSettled(setup, { scope });

    expect(scope.getState($result)).toBe("common:foo");
  });

  test("returns t-function while initialized with instance (static)", async () => {
    const instance = createInstance({
      resources: { th: { common: { foo: "bar" } } },
      lng: "th",
    });

    const setup = createEvent();

    const { $t } = createI18nextIntegration({
      instance,
      setup,
    });

    const $result = $t.map((t) => t("common:foo"));

    const scope = fork();

    await allSettled(setup, { scope });

    expect(scope.getState($result)).toBe("bar");
  });

  test("returns t-function while initialized with instance (store)", async () => {
    const instance = createInstance({
      resources: { th: { common: { foo: "bar" } } },
      lng: "th",
    });

    const setup = createEvent();

    const { $t } = createI18nextIntegration({
      instance: createStore<i18n | null>(instance),
      setup,
    });

    const $result = $t.map((t) => t("common:foo"));

    const scope = fork();

    await allSettled(setup, { scope });

    expect(scope.getState($result)).toBe("bar");
  });

  test("returns t-function while initialized with instance (lazy store)", async () => {
    const $instance = createStore<i18n | null>(null);
    const instance = createInstance({
      resources: { th: { common: { foo: "bar" } } },
      lng: "th",
    });

    const setup = createEvent();

    const { $t } = createI18nextIntegration({
      instance: $instance,
      setup,
    });

    const $result = $t.map((t) => t("common:foo"));

    const scope = fork();

    await allSettled(setup, { scope });
    expect(scope.getState($result)).toBe("common:foo");

    await allSettled($instance, { scope, params: instance });

    expect(scope.getState($result)).toBe("bar");
  });
});