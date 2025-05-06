import * as helpers from "./views/helpers";

function mergeHomeAssistantData(areas, devices, entities, states) {
  function mergeEntityData(entityId, entity, device, state) {
    const domain = entityId.split(".")[0];
    const mergedEntity = { ...device, domain }; // Start with device info

    // Merge entity properties but skip null values
    for (const [key, value] of Object.entries(entity)) {
      if (value !== null) mergedEntity[key] = value;
    }

    // Merge state properties but skip null values
    for (const [key, value] of Object.entries(state)) {
      if (value !== null) mergedEntity[key] = value;
    }

    return mergedEntity;
  }

  const mergedData = {};

  // Process entities first
  for (const [idx, entity] of Object.entries(entities)) {
    const entityId = entity.entity_id;
    const device = devices.find((d) => d.id === entity.device_id) || {}; // Get device metadata if available
    const state = states[entityId] || {}; // Get state info

    mergedData[entityId] = mergeEntityData(entityId, entity, device, state);
  }

  // Include entities from states that are missing in mergedData
  // Unsure why but 'zone.home' is missing from entities
  // Which was populated via hass.callWS({ type: "config/entity_registry/list" })
  for (const [entityId, state] of Object.entries(states)) {
    if (!mergedData[entityId]) {
      const device = devices.find((d) => d.id === state.device_id) || {}; // Get device metadata if available
      mergedData[entityId] = mergeEntityData(entityId, {}, device, state); // Use an empty entity for missing data
    }
  }

  // Add in the areas
  for (const area of areas) {
    mergedData[`area.${area.area_id}`] = area;
  }

  return mergedData;
}

class Dashboard {
  static async generate(config, hass) {
    // Query all data we need. We will make it available to views by storing it in strategy options.
    const [floors, areas, devices, entities] = await Promise.all([
      hass.callWS({ type: "config/floor_registry/list" }),
      hass.callWS({ type: "config/area_registry/list" }),
      hass.callWS({ type: "config/device_registry/list" }),
      hass.callWS({ type: "config/entity_registry/list" }),
    ]);

    // TODO: make dense_section_placement a config option
    // Merge the home assistant data into one object whose keys are the entity ids
    const mergedEntityMetadata = mergeHomeAssistantData(
      areas,
      devices,
      entities,
      hass.states
    );

    // TODO: Remove this debug code
    console.log("floors");
    console.log(floors);
    console.log("areas");
    console.log(areas);
    console.log("devices");
    console.log(devices);
    console.log("entities");
    console.log(entities);
    console.log("hass.states");
    console.log(hass.states);
    console.log("mergedEntityMetadata");
    console.log(mergedEntityMetadata);

    // This temperature view was made really to help me debug some issues with my temperature sensors
    // I think it can be revised and turned into a "magic-debugging-dashboard-strategy" view
    // Create a view for the temperature
    const temperature_view = {
      strategy: {
        type: "custom:magic-temperature",
        options: {
          mergedEntityMetadata,
        },
      },
      title: "Temperature",
      path: "temperature",
      icon: "mdi:thermometer",
    };

    // Create a view for the people
    const people_view = {
      strategy: {
        type: "custom:magic-people",
        options: {
          devices,
          entities,
          mergedEntityMetadata,
        },
      },
      title: "People",
      path: "people",
      icon: "mdi:card-account-details",
    };

    // Create a view for each area
    const area_views = areas
      .filter((area) => area.icon !== null) // Filter out areas since I have weird areas right now. TODO: remove this filter
      .sort((a, b) => {
        // Find the floor object for each area's floor_id
        const floorA = floors.find((f) => f.floor_id === a.floor_id);
        const floorB = floors.find((f) => f.floor_id === b.floor_id);

        // Extract levels (default to 0 if not found)
        const levelA = floorA?.level || 0;
        const levelB = floorB?.level || 0;

        // First, sort by level (ascending)
        if (levelA !== levelB) {
          return levelA - levelB;
        }

        // If levels are the same, sort alphabetically by name
        return a.name.localeCompare(b.name);
      })
      .map((area) => ({
        strategy: {
          type: "custom:magic-area",
          options: {
            area,
            devices,
            entities,
            mergedEntityMetadata,
          },
        },
        title: area.name,
        path: area.area_id,
        icon: area.icon || undefined, // Set the icon if it exists
      }));

    // Create a view for the weather
    const weather_entity_id = "weather.home";
    const weather_view = {
      strategy: {
        type: "custom:magic-weather",
        options: {
          devices,
          entities,
          weather_entity_id,
        },
      },
      title: "Weather",
      path: "weather",
      icon: getValidWeatherIcon(
        "mdi:weather-" + hass.states["weather.home"].state
      ),
    };

    const error_view = {
      strategy: {
        type: "custom:magic-error",
      },
      title: "Errors",
      path: "errors",
      icon: "mdi:alert-decagram",
    };

    const views = [...area_views, people_view, weather_view];
    if (hass.user.is_admin) {
      views.push(error_view);
    }
    return {
      views,
    };
  }
}

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
  ]);

  return validWeatherIcons.has(icon) ? icon : "mdi:weather-sunny";
}

class ErrorView {
  static async generate(config, hass) {
    function errorColHeader(name, icon) {
      return {
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
            tap_action: {
              action: "none",
            },
          },
        ],
        // rows: 0.75,
        card_layout: "large",
        modules: helpers.BUBBLE_MODULES,
        card_mod: helpers.CARD_MOD,
      };
    }

    function dropdown(titleCard, cards) {
      return {
        type: "custom:expander-card",
        expanded: true,
        "title-card-button-overlay": true,
        "title-card-clickable": false,
        clear: true,
        "title-card": titleCard,
        cards,
      };
    }

    return {
      type: "sections",
      max_columns: 4,
      //badges,//: [helpers.alertBadge()], // For some reason badges just aren't being applied for this view
      sections: [
        helpers.alertBadge(),
        {
          type: "grid",
          cards: [
            dropdown(errorColHeader("Errors", "mdi:alert-octagram-outline"), [
              {
                type: "custom:auto-entities",
                card: {
                  type: "entities",
                },
                filter: {
                  include: [
                    {
                      entity_id: "*error*",
                    },
                  ],
                  exclude: [
                    {
                      state: "idle",
                    },
                    {
                      state: "off",
                    },
                    {
                      state: "none",
                    },
                    {
                      state: "ok",
                    },
                  ],
                },
              },
              {
                type: "vertical-stack",
                cards: [
                  {
                    type: "custom:bubble-card",
                    card_type: "pop-up",
                    hash: "#info-errors",
                    name: "",
                    button_type: "name",
                    show_header: false,
                  },
                  {
                    type: "markdown",
                    content:
                      "Any entities whose entity id indicates it represents an error. Those which are in a normal state such as `idle`, `off`, or `none` will not be displayed.",
                    title: "Errors",
                  },
                ],
              },
            ]),
          ],
        },
        {
          type: "grid",
          cards: [
            dropdown(errorColHeader("Unknown", "mdi:progress-question"), [
              {
                type: "custom:auto-entities",
                card: {
                  type: "entities",
                },
                filter: {
                  include: [
                    {
                      state: "unknown",
                    },
                  ],
                  exclude: [
                    {
                      entity_id: "^scene\\.*",
                    },
                    {
                      entity_id: "^button\\.*",
                    },
                    {
                      entity_id: "^input_button\\.*",
                    },
                    {
                      entity_id: "^sensor\\.discord_user_.*\\D.*",
                    },
                    {
                      integration: "waze_travel_time",
                    },
                  ],
                },
                sort: {
                  method: "entity_id",
                },
              },
              {
                type: "vertical-stack",
                cards: [
                  {
                    type: "custom:bubble-card",
                    card_type: "pop-up",
                    hash: "#info-unknown",
                    name: "",
                    button_type: "name",
                    show_header: false,
                  },
                  {
                    type: "markdown",
                    content:
                      "Any entity whose state is currently `unknown`. This excludes some types which are always `unknown` such as `scene`, `button`, and `input_button`. Also excluded are those which are commonly `unknown` and have another entity on the device to indicate an issue, such as sensors included with the `discord_game` integration.",
                    title: "Unknown",
                  },
                ],
              },
            ]),
          ],
        },
        {
          type: "grid",
          cards: [
            dropdown(errorColHeader("Unavailable", "mdi:help-circle"), [
              {
                type: "custom:auto-entities",
                card: {
                  type: "entities",
                },
                filter: {
                  include: [
                    {
                      state: "unavailable",
                    },
                  ],
                  exclude: [],
                },
                sort: {
                  method: "entity_id",
                },
              },
              {
                type: "vertical-stack",
                cards: [
                  {
                    type: "custom:bubble-card",
                    card_type: "pop-up",
                    hash: "#info-unavailable",
                    name: "",
                    button_type: "name",
                    show_header: false,
                  },
                  {
                    type: "markdown",
                    content:
                      "Any entity whose state is currently `unavailable`. You should review these and determine if they should be deleted or otherwise determine how to start obtaining their state.",
                    title: "Unavailable",
                  },
                ],
              },
            ]),
          ],
        },
        {
          type: "grid",
          cards: [
            dropdown(errorColHeader("Alerts", "mdi:alert-outline"), [
              {
                type: "custom:auto-entities",
                card: {
                  type: "entities",
                },
                filter: {
                  include: [
                    {
                      entity_id: "^alert\\.*",
                    },
                  ],
                  exclude: [],
                },
                sort: {
                  method: "state",
                },
              },
              {
                type: "vertical-stack",
                cards: [
                  {
                    type: "custom:bubble-card",
                    card_type: "pop-up",
                    hash: "#info-alerts",
                    name: "",
                    button_type: "name",
                    show_header: false,
                  },
                  {
                    type: "markdown",
                    content: "Any alert entity regardless of status.",
                    title: "Unavailable",
                  },
                ],
              },
            ]),
          ],
        },
      ],
      dense_section_placement: true,
      badges: [],
    };
  }
}

customElements.define("ll-strategy-view-magic-error", ErrorView);

customElements.define(
  "ll-strategy-dashboard-magic-dashboard-strategy",
  Dashboard
);
