import * as helpers from "./views/helpers";

/* =========================
 * Utilities / small helpers
 * ========================= */
/**
 * Creates an object indexed by a given key from an array of objects.
 *
 * @template T
 * @param {T[]} arr - Array of objects to index.
 * @param {keyof T} key - The property name to use as the key for the index.
 * @returns {Record<string, T>} - An object where each key is `obj[key]` and the value is the object itself.
 *
 * @example
 * const arr = [{ id: 'a', val: 1 }, { id: 'b', val: 2 }];
 * const indexed = indexBy(arr, 'id');
 * // indexed = { a: { id: 'a', val: 1 }, b: { id: 'b', val: 2 } }
 */
const indexBy = (arr, key) =>
  Object.fromEntries((arr ?? []).map((obj) => [obj[key], obj]));

/**
 * Merges multiple objects together while skipping properties whose values are `null`.
 * Later objects in the argument list overwrite earlier ones when keys overlap.
 *
 * @param {...Object} objs - Any number of objects to merge.
 * @returns {Object} - A new object containing all non-null key-value pairs.
 *
 * @example
 * const result = mergeSkipNull(
 *   { a: 1, b: null },
 *   { b: 2, c: 3 }
 * );
 * // result = { a: 1, b: 2, c: 3 }
 */
const mergeSkipNull = (...objs) =>
  objs.reduce((acc, obj) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (v !== null) acc[k] = v;
    }
    return acc;
  }, {});

/**
 * Extracts the domain (the part before the first dot) from a Home Assistant entity ID.
 *
 * @param {string} [entityId] - A Home Assistant entity ID, e.g., "sensor.temperature_livingroom".
 * @returns {string|undefined} - The domain portion (e.g., "sensor"), or `undefined` if invalid.
 *
 * @example
 * domainOf("light.kitchen"); // "light"
 * domainOf(undefined);       // undefined
 */
const domainOf = (entityId) => entityId?.split(".")[0];

/**
 * Merge all HA registries/state into a single dictionary keyed by entity_id.
 * For each entity_id:
 *  - combine device info (if any), entity registry info, and state object
 *  - skip null-valued props when merging
 *  - add `domain` derived from entity_id
 */
function mergeHomeAssistantData(areas, devices, entities, states) {
  // Create index of devices by device_id for quick lookup
  const devicesById = indexBy(devices, "id");

  // Build a union of entity IDs from entity registry and states
  const entityIds = new Set([
    ...Object.values(entities || {}).map((e) => e.entity_id),
    ...Object.keys(states || {}),
  ]);

  const mergedData = {};

  // Iterate through every unique entity ID found in either the entity registry or the states
  for (const entityId of entityIds) {
    // Try to find the corresponding entity object in the entity registry
    // (entities is an array of registry entries, each with an "entity_id" field)
    // If entities is missing or no match is found, default to an empty object
    const entity =
      (entities || []).find?.((e) => e.entity_id === entityId) || {};

    // Look up device metadata for this entity.
    // Prefer the device linked in the entity registry (entity.device_id)
    // If that’s missing, some state objects (like integrations) may include their own device_id
    // If both are missing, default to an empty object so spreading doesn’t throw
    const deviceMeta =
      devicesById[entity?.device_id] ||
      devicesById[states?.[entityId]?.device_id] || // I don't think this exists, but just in case
      {};

    // Grab the current runtime state for this entity from Home Assistant
    // If the state doesn’t exist (e.g. the entity is disabled or static), use an empty object
    const state = states?.[entityId] || {};

    // Merge data sources together into one object for this entity:
    // - Start with device metadata (so hardware info like manufacturer/model is included)
    // - Add a computed "domain" (e.g. "sensor", "light") derived from the entity_id prefix
    // - Layer on registry fields (name, unique_id, etc.)
    // - Finally, add runtime state fields (attributes, last_changed, etc.)
    // The mergeSkipNull helper ensures that null values are ignored (they don’t overwrite valid data)
    const merged = mergeSkipNull(
      { ...deviceMeta, domain: domainOf(entityId) },
      entity,
      state
    );

    // Store the merged result under this entity_id in the global mergedData dictionary
    // This makes it easy to look up any entity (or even devices and areas later) by ID
    mergedData[entityId] = merged;
  }

  // Add areas as pseudo-entities so you can look them up the same way
  for (const area of areas || []) {
    mergedData[`area.${area.area_id}`] = area;
  }

  return mergedData;
}

/* =========================
 * View helpers
 * ========================= */
const makeStrategyView = ({ type, options, title, path, icon }) => ({
  strategy: { type, options },
  title,
  path,
  icon,
});

function getValidWeatherIcon(icon) {
  const validWeatherIcons = new Set([
    "mdi:weather-sunny",
    "mdi:weather-cloudy",
    "mdi:weather-rainy",
    "mdi:weather-lightning",
    "mdi:weather-snowy",
    "mdi:weather-fog",
    "mdi:weather-windy",
    "mdi:weather-hail",
    "mdi:weather-partly-cloudy",
    "mdi:weather-sunset",
    "mdi:weather-night",
    "mdi:weather-tornado",
    "mdi:weather-hurricane",
    "mdi:weather-snowy-rainy",
    "mdi:weather-lightning-rainy",
    "mdi:weather-sunny-off",
    "mdi:weather-cloudy-alert",
    "mdi:weather-partly-snowy-rainy",
  ]);

  // Return a valid icon or a safe fallback
  return validWeatherIcons.has(icon) ? icon : "mdi:weather-sunny";
}

/* =========================
 * Dashboard generator
 * ========================= */
class Dashboard {
  static async generate(config, hass) {
    // Fetch registries in parallel
    const [floors, areas, devices, entities] = await Promise.all([
      hass.callWS({ type: "config/floor_registry/list" }),
      hass.callWS({ type: "config/area_registry/list" }),
      hass.callWS({ type: "config/device_registry/list" }),
      hass.callWS({ type: "config/entity_registry/list" }),
    ]);

    const mergedEntityMetadata = mergeHomeAssistantData(
      areas,
      devices,
      entities,
      hass.states
    );

    // --- Optional debug gate (flip to true when you want logs)
    if (config.debug) {
      console.log("floors", floors);
      console.log("areas", areas);
      console.log("devices", devices);
      console.log("entities", entities);
      console.log("hass.states", hass.states);
      console.log("mergedEntityMetadata", mergedEntityMetadata);
      console.log("Config area hide list:", config?.areas?.hide || []);
    }

    // Comparator for areas by floor level then name
    const floorsById = indexBy(floors, "floor_id");
    const areaComparator = (a, b) => {
      const levelA = floorsById[a.floor_id]?.level ?? 0;
      const levelB = floorsById[b.floor_id]?.level ?? 0;
      if (levelA !== levelB) return levelA - levelB;
      return a.name.localeCompare(b.name);
    };

    // Temperature view
    const temperature_view = makeStrategyView({
      type: "custom:magic-temperature",
      options: { mergedEntityMetadata },
      title: "Temperature",
      path: "temperature",
      icon: "mdi:thermometer",
    });

    // People view
    const people_view = makeStrategyView({
      type: "custom:magic-people",
      options: { devices, entities, mergedEntityMetadata },
      title: "People",
      path: "people",
      icon: "mdi:card-account-details",
    });

    // Area views (filter, sort, map)
    const area_views = (areas || [])
      .filter((area) => !(config?.areas?.hide || []).includes(area.area_id))
      .sort(areaComparator)
      .map((area) =>
        makeStrategyView({
          type: "custom:magic-area",
          options: { area, devices, entities, mergedEntityMetadata },
          title: area.name,
          path: area.area_id,
          icon: area.icon || undefined,
        })
      );

    // Weather view
    const weather_entity_id = "weather.home";
    const weather_state = hass.states?.[weather_entity_id]?.state;
    const weather_icon = getValidWeatherIcon(`mdi:weather-${weather_state}`);

    const weather_view = makeStrategyView({
      type: "custom:magic-weather",
      options: { devices, entities, weather_entity_id },
      title: "Weather",
      path: "weather",
      icon: weather_icon,
    });

    // Error view (only for admins)
    const error_view = {
      strategy: { type: "custom:magic-error" },
      title: "Errors",
      path: "errors",
      icon: "mdi:alert-decagram",
    };

    const views = [...area_views, people_view, weather_view, temperature_view];
    if (hass.user?.is_admin) views.push(error_view);

    return { views };
  }
}

/* =========================
 * Error view (DRY section factory)
 * ========================= */
class ErrorView {
  static async generate(config, hass) {
    const errorColHeader = (name, icon) => ({
      type: "custom:bubble-card",
      card_type: "separator",
      name,
      icon,
      sub_button: [
        {
          name: "Info",
          icon: "mdi:help-circle",
          state_background: false,
          show_background: false,
          show_attribute: false,
          show_last_changed: false,
          tap_action: {
            action: "navigate",
            navigation_path: `#info-${name}`.toLowerCase(),
          },
        },
        {
          show_background: false,
          show_icon: false,
          show_state: false,
          name: " ",
          show_name: true,
          tap_action: { action: "none" },
        },
      ],
      card_layout: "large",
      modules: helpers.BUBBLE_MODULES,
      card_mod: helpers.CARD_MOD,
    });

    const dropdown = (titleCard, cards) => ({
      type: "custom:expander-card",
      expanded: true,
      "title-card-button-overlay": true,
      "title-card-clickable": false,
      clear: true,
      "title-card": titleCard,
      cards,
    });

    // Factory for a repeated "auto-entities + info pop-up" section
    const makeAutoEntitiesSection = ({
      name,
      icon,
      include,
      exclude = [],
      sort,
      infoHash,
      infoTitle,
      infoContent,
    }) =>
      dropdown(errorColHeader(name, icon), [
        {
          type: "custom:auto-entities",
          card: { type: "entities" },
          filter: { include, exclude },
          ...(sort ? { sort } : {}),
        },
        {
          type: "vertical-stack",
          cards: [
            {
              type: "custom:bubble-card",
              card_type: "pop-up",
              hash: infoHash,
              name: "",
              button_type: "name",
              show_header: false,
            },
            {
              type: "markdown",
              content: infoContent,
              title: infoTitle,
            },
          ],
        },
      ]);

    const sections = [
      makeAutoEntitiesSection({
        name: "Errors",
        icon: "mdi:alert-octagram-outline",
        include: [{ entity_id: "*error*" }],
        exclude: [
          { state: "idle" },
          { state: "off" },
          { state: "none" },
          { state: "ok" },
        ],
        infoHash: "#info-errors",
        infoTitle: "Errors",
        infoContent:
          "Any entities whose entity id indicates it represents an error. Those which are in a normal state such as `idle`, `off`, or `none` will not be displayed.",
      }),
      makeAutoEntitiesSection({
        name: "Unknown",
        icon: "mdi:progress-question",
        include: [{ state: "unknown" }],
        exclude: [
          { entity_id: "^scene\\.*" },
          { entity_id: "^button\\.*" },
          { entity_id: "^input_button\\.*" },
          { entity_id: "^sensor\\.discord_user_.*\\D.*" },
          { integration: "waze_travel_time" },
        ],
        sort: { method: "entity_id" },
        infoHash: "#info-unknown",
        infoTitle: "Unknown",
        infoContent:
          "Any entity whose state is currently `unknown`. This excludes some types which are always `unknown` such as `scene`, `button`, and `input_button`. Also excluded are those which are commonly `unknown` and have another entity on the device to indicate an issue, such as sensors included with the `discord_game` integration.",
      }),
      makeAutoEntitiesSection({
        name: "Unavailable",
        icon: "mdi:help-circle",
        include: [{ state: "unavailable" }],
        exclude: [],
        sort: { method: "entity_id" },
        infoHash: "#info-unavailable",
        infoTitle: "Unavailable",
        infoContent:
          "Any entity whose state is currently `unavailable`. You should review these and determine if they should be deleted or otherwise determine how to start obtaining their state.",
      }),
      makeAutoEntitiesSection({
        name: "Alerts",
        icon: "mdi:alert-outline",
        include: [{ entity_id: "^alert\\.*" }],
        exclude: [],
        sort: { method: "state" },
        infoHash: "#info-alerts",
        infoTitle: "Unavailable",
        infoContent: "Any alert entity regardless of status.",
      }),
    ];

    return {
      type: "sections",
      max_columns: 4,
      badges: [helpers.alertBadge()],
      sections: sections.map((cards) => ({ type: "grid", cards: [cards] })),
      dense_section_placement: true,
    };
  }
}

customElements.define("ll-strategy-view-magic-error", ErrorView);

customElements.define(
  "ll-strategy-dashboard-magic-dashboard-strategy",
  Dashboard
);
