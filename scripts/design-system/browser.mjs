/**
 * Exercises computed presentation and interaction states in the owner's prepared browser.
 * @param {import("playwright").Page} page - Exclusively owned browser page.
 * @returns {Promise<string[]>} Successful assertions, including restored negative probes.
 * @throws {Error} If a theme, interaction or semantic assertion fails.
 */
export async function verifyDesignSystem(page) {
  /** @type {string[]} */
  const results = [];
  await page.bringToFront();
  /**
   * @param {boolean} condition - Observed invariant.
   * @param {string} message - Assertion evidence.
   * @returns {void}
   * @throws {Error} If the observed invariant fails.
   */
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    results.push(message);
  };
  /**
   * @param {import("playwright").Locator} locator - Control whose computed appearance is observed.
   * @returns {Promise<{cursor: string, background: string, colour: string, shadow: string, outline: string, border: string, fontSize: string, focusVisible: boolean}>} Computed interaction appearance.
   */
  const styles = (locator) =>
    locator.evaluate((element) => {
      const value = getComputedStyle(element);
      return {
        cursor: value.cursor,
        background: value.backgroundColor,
        colour: value.color,
        shadow: value.boxShadow,
        outline: value.outlineStyle,
        border: value.borderColor,
        fontSize: value.fontSize,
        focusVisible: element.matches(":focus-visible"),
      };
    });
  await page.goto("http://localhost:3000/dev/component-states");
  await page.getByRole("heading", { name: "Component states (development fixtures)" }).waitFor();
  const themeGuard = async () => {
    const roles = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [
        "background",
        "foreground",
        "card",
        "popover",
        "primary",
        "secondary",
        "accent",
        "accent-foreground",
        "muted",
        "muted-foreground",
        "destructive",
        "success",
        "warning",
        "input",
        "border",
        "ring",
        "card-foreground",
        "popover-foreground",
        "primary-foreground",
        "secondary-foreground",
        "destructive-foreground",
        "success-foreground",
        "warning-foreground",
        "link",
        "overlay",
      ].map((role) => [role, style.getPropertyValue(`--${role}`).trim()]);
    });
    if (!roles.length || roles.some(([, value]) => !value))
      throw new Error("Semantic theme role is missing");
  };
  await themeGuard();
  results.push("All semantic theme roles resolve");
  const contrasts = await page.evaluate(() => {
    const roles = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    /**
     * @param {string} colour - Resolved theme colour.
     * @returns {number} Relative luminance of the computed RGB channels.
     * @throws {Error} If the browser does not expose three colour channels.
     */
    const luminance = (colour) => {
      probe.style.color = colour;
      const channels = getComputedStyle(probe)
        .color.match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      if (channels?.length !== 3) throw new Error("Theme colour has no complete RGB channels");
      const values = channels
        .map((value) => value / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
      const [red, green, blue] = values;
      if (red === undefined || green === undefined || blue === undefined)
        throw new Error("Theme luminance requires three channels");
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };
    /** @type {[string, string][]} */
    const pairs = [
      ["foreground", "background"],
      ["muted-foreground", "background"],
      ["primary-foreground", "primary"],
      ["secondary-foreground", "secondary"],
      ["accent-foreground", "accent"],
      ["destructive", "destructive-foreground"],
      ["success", "success-foreground"],
      ["warning", "warning-foreground"],
    ];
    const values = pairs.map(([text, surface]) => {
      const a = luminance(roles.getPropertyValue(`--${text}`));
      const b = luminance(roles.getPropertyValue(`--${surface}`));
      return { text, surface, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
    probe.remove();
    return values;
  });
  assert(
    contrasts.length > 0 && contrasts.every(({ ratio }) => ratio >= 4.5),
    `Semantic text contrast meets 4.5:1: ${JSON.stringify(contrasts)}`,
  );
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--accent", "initial");
  });
  let caught = false;
  try {
    await themeGuard();
  } catch {
    caught = true;
  }
  await page.evaluate(() => document.documentElement.style.removeProperty("--accent"));
  assert(caught, "Planted missing accent fails the theme guard");
  await themeGuard();
  for (const variant of ["default", "outline", "ghost", "destructive", "secondary"]) {
    const button = page.getByTestId(`button-${variant}`);
    await page.mouse.move(0, 0);
    const before = await styles(button);
    await button.hover();
    await page.waitForTimeout(200);
    const after = await styles(button);
    assert(after.cursor === "pointer", `${variant} button uses pointer`);
    assert(before.background !== after.background, `${variant} button hover is visible`);
    await button.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const focus = await styles(button);
    assert(
      focus.focusVisible &&
        (focus.shadow !== "none" || !["none", "hidden"].includes(focus.outline)),
      `${variant} button focus is visible`,
    );
  }
  const disabled = page.getByTestId("button-disabled");
  const countBefore = await page.getByTestId("activations").textContent();
  await disabled.evaluate((element) => {
    if (!(element instanceof HTMLElement))
      throw new Error("Activation fixture requires an HTML control");
    element.click();
  });
  assert(
    (await page.getByTestId("activations").textContent()) === countBefore,
    "Disabled button cannot activate",
  );
  assert(await disabled.isDisabled(), "Disabled button has native disabled semantics");
  assert(
    (await styles(disabled)).cursor !== "pointer",
    "Disabled button does not advertise pointer",
  );
  assert(
    (await styles(page.getByLabel("Editable field"))).cursor === "text",
    "Text input has text cursor",
  );
  assert(
    (await styles(page.getByLabel("Invalid field"))).border !==
      (await styles(page.getByLabel("Editable field"))).border,
    "Invalid input has distinct border",
  );
  await page.getByTestId("menu-trigger").click();
  const menu = page.getByTestId("menu-enabled");
  const composed = page.getByTestId("menu-composed");
  assert((await page.getByRole("menuitem").count()) > 0, "Menu input set is non-empty");
  const menuGuard = async () => {
    if ((await styles(menu)).cursor !== "pointer") throw new Error("Menu pointer regressed");
  };
  await menuGuard();
  await menu.evaluate((element) => {
    element.style.setProperty("cursor", "default", "important");
  });
  caught = false;
  try {
    await menuGuard();
  } catch {
    caught = true;
  }
  await menu.evaluate((element) => element.style.removeProperty("cursor"));
  assert(caught, "Planted menu cursor regression fails the computed-style guard");
  await menuGuard();
  await composed.hover();
  await page.waitForTimeout(200);
  const unhighlighted = await styles(menu);
  await menu.hover();
  await page.waitForTimeout(200);
  const highlighted = await styles(menu);
  assert(
    highlighted.background !== "rgba(0, 0, 0, 0)" &&
      highlighted.background !== unhighlighted.background,
    "Highlighted menu has visible background",
  );
  await composed.hover();
  await page.waitForTimeout(200);
  const composition = await styles(composed);
  assert(
    composition.cursor === "pointer" && composition.background === highlighted.background,
    "Button/menu composition shares highlighted appearance",
  );
  assert(
    (await page.getByRole("menuitemcheckbox").getAttribute("aria-checked")) === "true",
    "Selected item retains checked semantics",
  );
  await page
    .getByRole("menuitem", { name: "Disabled menu item", exact: true })
    .evaluate((element) => {
      if (!(element instanceof HTMLElement))
        throw new Error("Activation fixture requires an HTML control");
      element.click();
    });
  assert(
    (await page.getByTestId("activations").textContent()) === countBefore,
    "Disabled menu cannot activate",
  );
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-testid") === "menu-trigger",
  );
  assert(
    await page
      .getByTestId("menu-trigger")
      .evaluate((element) => element === document.activeElement),
    "Menu returns focus to its trigger",
  );
  await page.getByRole("button", { name: "Tooltip target" }).focus();
  await page.getByRole("tooltip").waitFor();
  results.push("Keyboard tooltip renders in portal");
  await page.keyboard.press("Escape");
  const amounts = page.getByLabel("Token amount");
  assert(
    (await amounts.count()) === 3,
    "Amount state census includes editable, read-only and disabled",
  );
  assert(
    (await amounts.nth(1).getAttribute("readonly")) !== null &&
      !(await amounts.nth(1).isDisabled()),
    "Read-only amount preserves token selection capability",
  );
  assert(await amounts.nth(2).isDisabled(), "Disabled amount is natively disabled");
  await page.getByRole("button", { name: "max", exact: true }).click();
  assert(
    (await amounts.first().inputValue()) === "123.456789012345678901",
    "Maximum amount preserves exact decimal precision",
  );
  const before = await styles(page.getByTestId("shared-caption-a"));
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--muted-foreground", "rgb(1, 2, 3)");
  });
  const a = await styles(page.getByTestId("shared-caption-a"));
  const b = await styles(page.getByTestId("shared-caption-b"));
  await page.evaluate(() => document.documentElement.style.removeProperty("--muted-foreground"));
  assert(
    a.colour === b.colour && a.colour !== before.colour,
    "One theme change propagates to two independent consumers",
  );
  await page.getByRole("button", { name: "Show toast" }).click();
  await page.getByText("Themed error fixture").waitFor();
  results.push("Themed toast renders");
  return results;
}
