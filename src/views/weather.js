import * as helpers from "./helpers.js";

function header() {
  const styles = helpers.wrapInBubbleCardStyleIIFE(
    helpers.bubbleStyleConditional2Row("window.innerWidth < 768")
  );

  // Show background on subbuttons
  const show_background = true;

  return {
    type: "custom:bubble-card",
    card_type: "button",
    button_type: "state",
    entity: "sensor.magic_areas_aggregates_interior_aggregate_temperature",
    name: "Indoors",
    sub_button: [
      {
        entity:
          "sensor.magic_areas_aggregates_interior_aggregate_carbon_dioxide",
        show_name: false,
        show_icon: true,
        state_background: false,
        show_background,
        show_attribute: false,
        attribute: "friendly_name",
        show_last_changed: false,
        show_state: true,
        name: "CO₂",
        visibility: [
          helpers.visibilityNotUnknownUnavailable(
            "sensor.magic_areas_aggregates_interior_aggregate_carbon_dioxide"
          ),
        ],
      },
      {
        entity: "sensor.magic_areas_aggregates_interior_aggregate_humidity",
        show_name: false,
        show_icon: true,
        state_background: false,
        show_background,
        show_attribute: false,
        attribute: "friendly_name",
        show_last_changed: false,
        show_state: true,
        name: "Humidity",
        visibility: [
          helpers.visibilityNotUnknownUnavailable(
            "sensor.magic_areas_aggregates_interior_aggregate_humidity"
          ),
        ],
      },
      {
        entity:
          "sensor.magic_areas_aggregates_interior_aggregate_volatile_organic_compounds_parts",
        show_name: false,
        show_icon: true,
        state_background: false,
        show_background,
        show_attribute: false,
        attribute: "friendly_name",
        show_last_changed: false,
        show_state: true,
        name: "VOC",
        visibility: [
          {
            condition: "screen",
            media_query: "(min-width: 768px)",
          },
          helpers.visibilityNotUnknownUnavailable(
            "sensor.magic_areas_aggregates_interior_aggregate_volatile_organic_compounds_parts"
          ),
        ],
      },
    ],
    card_layout: "large",
    grid_options: {
      columns: "full",
    },
    styles,
  };
}

function clock(entity_id) {
  return {
    type: "custom:clock-weather-card",
    entity: entity_id,
    show_humidity: true,
    forecast_rows: 7,
    apparent_sensor: "sensor.home_apparent_temperature",
  };
}

function hourly(entity_id) {
  return {
    type: "custom:clock-weather-card",
    entity: entity_id,
    show_humidity: false,
    hide_today_section: true,
    hourly_forecast: true,
    forecast_rows: 24,
  };
}

class WeatherView {
  static async generate(config, hass) {
    const { devices, entities, weather_entity_id } = config;
    const max_columns = 2;

    const weather_entity_ida = "weather.home";

    const sections = [];

    sections.push(helpers.newGrid(header(), max_columns));
    sections.push(helpers.newGrid(clock(weather_entity_ida)));
    sections.push(helpers.newGrid(hourly(weather_entity_ida)));
    helpers.AddCardMod(sections)
    return {
      type: "sections",
      max_columns: max_columns,
      sections,
      badges: [helpers.alertBadge()],
    };
  }
}

customElements.define("ll-strategy-view-magic-weather", WeatherView);
