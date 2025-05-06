import * as helpers from "./helpers.js";

const TITLE = "Individual Area Thermometers";

function getEntity(entities, entity_id) {
  return entities.filter((x) => x.entity_id == entity_id);
}

function entityAttributeIs(entity, attribute, value) {
  if ("attributes" in entity && attribute in entity.attributes) {
    return entity.attributes[attribute] === value;
  } else {
    return false;
  }
}

function entityIsClass(entity, deviceClass) {
  return entityAttributeIs(entity, "device_class", deviceClass);
}

class TemperatureView {
  static async generate(config, hass) {
    const { mergedEntityMetadata } = config;

    const sections = [];
    const max_columns = 2;

    const thermometers = Object.values(mergedEntityMetadata)
      .filter((entity) => entityIsClass(entity, "temperature")) // Filter to temperature class
      .filter((entity) => entity.area_id !== null) // Filter to those with an area to filter out things like Google Fit Body temperature and weather
      .filter((entity) => !entityAttributeIs(entity, "restored", true)) // Filter to non-restored
      .filter((entity) => ["living_room", "office"].includes(entity.area_id)) // Temp filter to just the areas I want. TODO: remove temp filter
      .filter((entity) => entity.platform !== "magic_areas"); // Temp filter to get rid of magic areas. TODO: make one of just the magic areas

    // const graph = {
    //   type: "history-graph",
    //   entities: thermometers.map((x) => ({ entity: x.entity_id })),
    // };

    const graph = {
      type: "custom:plotly-graph",
      title: TITLE,
      entities: thermometers.map((x) => ({ entity: x.entity_id })),
      hours_to_show: 24,
      refresh_interval: 10,
      layout: {
        xaxis: {
          tickformat: "%I:%M %p", // 12-hour format with AM/PM - TODO: make it use browser settings
          rangeselector: {
            // see examples: https://plotly.com/javascript/range-slider/
            // see API: https://plotly.com/javascript/reference/layout/xaxis/#layout-xaxis-rangeselector
            x: 0,
            y: -0.2, // Move it to the bottom so we won't cover up the labels
            buttons: [
              {
                count: 1,
                step: "minute",
              },
              {
                count: 30,
                step: "minute",
              },
              {
                count: 1,
                step: "hour",
              },
              {
                count: 12,
                step: "hour",
              },
              {
                count: 1,
                step: "day",
              },
              {
                count: 7,
                step: "day",
              },
            ],
          },
        },
      },
    };

    sections.push(helpers.newGrid([graph], max_columns));

    result = {
      type: "panel",
      title: TITLE,
      cards: [graph],
      badges: [helpers.alertBadge()],
    }
    helpers.AddCardMod(result);
    return result;
  }
}

customElements.define("ll-strategy-view-magic-temperature", TemperatureView);
