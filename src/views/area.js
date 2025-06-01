import * as helpers from "./helpers.js";

class AreaView {
  static async generate(config, hass) {
    const { area, devices, entities, mergedEntityMetadata } = config;

    // Extract the entities for this area
    const thisAreasEntities = helpers.filterEntityByArea(
      mergedEntityMetadata,
      area.area_id
    );

    const max_columns = 4;
    const sections = [];

    // Get the sensor for magic area state. TODO: do this only once
    const magic_areas_state_sensor = helpers
      .filterEntitiesByProperties(thisAreasEntities, {
        domain: "binary_sensor",
        platform: "magic_areas",
        "attributes.device_class": "occupancy",
      })
      .filter((entity) => entity.attributes && entity.attributes.type)[0]; // Filter to just the "magic area state" entity as to remove others such as the "aggregate_occupancy" sensor but don't rely on entity id

    // Add the header grid
    sections.push(
      helpers.newGrid(
        [
          newViewHeader(hass, devices, entities, area, thisAreasEntities),
          AreaStatePopUp(area, magic_areas_state_sensor),
        ],
        max_columns
      )
    );

    // Add the light grid
    sections.push(lightGrid(area, thisAreasEntities));

    // Add the fan grid
    sections.push(fanGrid(area, mergedEntityMetadata));

    // Add the litterbot grid
    sections.push(helpers.newGrid(litterbotCards(thisAreasEntities)));

    // Add the vacuum grid
    sections.push(helpers.newGrid(vacuumCards(thisAreasEntities)));

    // Temperature Graph Grid
    // sections.push(
    //   helpers.newGrid(newAreaTemperatureGraph(area, thisAreasEntities))
    // );
    sections.push(climate_control_grid(mergedEntityMetadata, area));

    // Automations Grid
    sections.push(AutomationGrid(thisAreasEntities));

    // Add card mod
    helpers.AddCardMod(sections);

    return {
      type: "sections",
      title: area.name,
      max_columns: max_columns,
      badges: [helpers.alertBadge()],
      sections: sections.filter((section) => section !== null),
    };
  }
}

function fanGrid(area, mergedEntityMetadata) {
  function newFanBubble(entity) {
    function calculateColumns(nameLength) {
      // Base value
      let columns = 1.2;

      // Increase by 0.2 for every additional 3 characters
      columns += Math.floor(nameLength / 3) * 0.2;

      // Ensure it doesn't exceed the max of 4
      return Math.min(columns, 4);
    }

    return {
      type: "custom:bubble-card",
      card_type: "button",
      entity: entity.entity_id,
      icon: "mdi:fan",
      // styles:
      //   "\n.bubble-icon {\n ${ state === 'on' ? 'animation: rotate 1.5s linear infinite !important;' : '' }  \n}\n@keyframes rotate {\n  0% { transform: rotate(0deg); }\n  100% { transform: rotate(360deg); }\n}",
      card_layout: "large",
      columns: calculateColumns(entity.name.length),
      tap_action: {
        action: "toggle",
      },
      double_tap_action: {
        action: "more-info",
      },
      hold_action: {
        action: "more-info",
      },
      modules: helpers.BUBBLE_MODULES,
    };
  }

  // Cards array
  const cards = [];

  // Get all the fans for this area
  const fans = Object.values(
    helpers.filterEntityKeysByDomain(mergedEntityMetadata, "fan")
  ).filter((x) => x.area_id === area.area_id);

  // If we don't have fans then return null
  if (fans.length === 0) {
    return null;
  }

  // Add the header
  const headerStyles = helpers.wrapInBubbleCardStyleIIFE(`
      const state = hass.states['${fans[0].entity_id}'].state;
      const entity_ids = [${fans.map((x) => `"${x.entity_id}"`).join(", ")}];
      const allSame = entity_ids.every(entity_id => hass.states[entity_id].state === state);

      if (allSame) {
        icon.setAttribute('icon', 'mdi:fan')
        icon.setAttribute('data-state', state)
      } else { icon.removeAttribute('data-state')}
  `);
  cards.push(sectionHeader("mdi:fan", "Fans", headerStyles));

  // Add the fans to the cards array
  cards.push(...fans.map((fan) => newFanBubble(fan)));

  // Return the grid of fans
  return helpers.newGrid(cards);
}

function lightGrid(area, thisAreasEntities) {
  const cards = [];

  // Add the lights
  cards.push(...newLights(thisAreasEntities));

  // Return null if we have no lights
  if (cards.length === 0) {
    return null;
  }

  // Add adaptive lighting controls
  // cards.push(newAdaptiveControls(area));
  cards.push(newAdaptiveControlsIconsOnly(area, thisAreasEntities));
  const motionControls = newMotionControlsIconsOnly(area, thisAreasEntities);
  if (motionControls) {
    cards.push(spacer(1.25), motionControls);
  }

  // Add the header
  cards.unshift(sectionHeader("mdi:lightbulb", "Lights"));

  // Return the grid
  return helpers.newGrid(cards);
}

function newViewHeader(hass, devices, entities, area, thisAreasEntities) {
  let defaultIcon = "mdi:information";
  let subButtons = [];

  // Add vacuum icon if its in the room
  const vacuum_entity = "sensor.rosey_the_robot_current_room"; // TODO: dont hard code
  subButtons.push({
    entity: vacuum_entity,
    icon: "mdi:robot-vacuum",
    name: "Robot Vacuum",
    visibility: [
      {
        condition: "state",
        entity: vacuum_entity,
        state: area.name,
      },
    ],
  });

  // // Add Temperature
  // subButtons.push({
  //   entity: `sensor.area_${area.area_id}_temperature`,
  //   show_attribute: false,
  //   show_icon: false,
  //   light_background: true,
  //   state_background: false,
  //   show_background: false,
  //   show_state: true,
  //   show_last_changed: false,
  //   name: "Temperature",
  // });

  const magic_area_temperature = `sensor.magic_areas_aggregates_${area.area_id}_aggregate_temperature`;

  // // Add all the magic stuff
  // const magic_entities = helpers
  //   .filterEntitiesToMagicArea(devices, entities, area.area_id)
  //   .filter((entity) => entity.entity_id !== magic_area_temperature);
  // magic_entities.forEach((entity) => {
  //   let friendly_name = entity.name;
  //   if (!friendly_name) {
  //     friendly_name = entity.original_name;
  //   }
  //   if (friendly_name) {
  //     friendly_name = friendly_name.replace(area.name, "").trim();
  //   }

  //   subButtons.push({
  //     entity: entity.entity_id,
  //     show_attribute: false,
  //     show_icon: true,
  //     light_background: true,
  //     state_background: false,
  //     show_background: false,
  //     show_state: true,
  //     show_last_changed: false,
  //     name: friendly_name,
  //     show_name: true,
  //   });
  // });

  // Add Magic Area Temperature
  // if (helpers.entityExists(hass, magic_area_temperature)) {
  //   subButtons.push({
  //     entity: magic_area_temperature,
  //     show_attribute: false,
  //     show_icon: false,
  //     light_background: true,
  //     state_background: false,
  //     show_background: false,
  //     show_state: true,
  //     show_last_changed: false,
  //     name: "Temperature",
  //   });
  // }

  // // Add motion sensor
  // subButtons.push({
  //   entity: `binary_sensor.${area.area_id}_motion`,
  //   name: "Motion",
  //   state_background: false,
  //   show_background: false,
  // });

  // // Add magic motion sensor
  // subButtons.push({
  //   entity: `binary_sensor.magic_areas_aggregates_${area.area_id}_aggregate_motion`,
  //   name: "Motion",
  //   state_background: false,
  //   show_background: false,
  // });

  // Add magic state sensor
  const magic_areas_state_sensor = helpers
    .filterEntitiesByProperties(thisAreasEntities, {
      domain: "binary_sensor",
      platform: "magic_areas",
      "attributes.device_class": "occupancy",
    })
    .filter((entity) => entity.attributes && entity.attributes.type)[0]; // Filter to just the "magic area state" entity as to remove others such as the "aggregate_occupancy" sensor but don't rely on entity id

  if (magic_areas_state_sensor) {
    subButtons.push({
      entity: magic_areas_state_sensor.entity_id,
      name: "Magic Areas State",
      state_background: false,
      show_background: false,
      show_icon: false,
      show_state: true,
      tap_action: {
        action: "navigate",
        navigation_path: "#occupancy",
      },
    });
  }

  // Add a link to the main area config
  if (true) {
    subButtons.push({
      name: "Area Link",
      icon: "mdi:information",
      state_background: false,
      show_background: false,
      tap_action: {
        action: "navigate",
        navigation_path: `/config/areas/area/${area.area_id}`,
      },
    });
  }

  // // Add magic state sensor states
  // subButtons.push({
  //   entity: `binary_sensor.magic_areas_presence_tracking_${area.area_id}_area_state`,
  //   name: "Magic Areas States",
  //   state_background: false,
  //   show_background: false,
  //   show_icon: false,
  //   show_state: false,
  //   show_attribute: true,
  //   attribute: "states",
  // });

  const funcs = `
      function titleCaseCSV(csvString) {
      // Function to convert a string to Title Case
      function toTitleCase(str) {
        return str
          .toLowerCase()
          .split(" ")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }

      // Split CSV string into individual elements
      let elements = csvString.split(",");

      // Apply title case transformation
      let transformedElements = elements.map(item => toTitleCase(item.trim()));

      // Join elements with • instead of commas
      return transformedElements.join(" • ");
    }
  `;

  const styles = `
    \${(() => {

      ${funcs}

      let container = card.querySelector('.bubble-sub-button-2 .bubble-sub-button-name-container')
      container.innerText = titleCaseCSV(container.innerText)

    })()}
    `;

  return {
    type: "custom:bubble-card",
    card_layout: "large",
    card_type: "separator",
    name: area.name,
    icon: area.icon || defaultIcon,
    sub_button: subButtons,
    // styles: styles,
    grid_options: {
      columns: "full",
    },
    modules: helpers.BUBBLE_MODULES,
  };
}

function newLightBubble(entity_id, adaptive_entity, show_name) {
  console.log(entity_id);
  console.log(adaptive_entity);
  let styles = undefined;
  let subbutton1 = undefined;
  if (adaptive_entity !== undefined) {
    styles = `
      .bubble-sub-button-1 {
        display: \${hass.states['${adaptive_entity.entity_id}'].attributes.autoreset_time_remaining && Object.keys(hass.states['${adaptive_entity.entity_id}'].attributes.autoreset_time_remaining).length === 0 ? 'none' : ''} !important;
      }
      \${(() => {

        function addSecondsToNow(seconds) {
            seconds = Math.round(seconds)
            let currentDate = new Date();               // Get the current date and time
            currentDate.setSeconds(currentDate.getSeconds() + seconds);  // Add the seconds to the current time
            return currentDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }

        function formatTime(seconds) {
            seconds = Math.round(seconds)
            let hrs = Math.floor(seconds / 3600);
            let mins = Math.floor((seconds % 3600) / 60);
            let secs = seconds % 60;

            // Build the time string and remove leading zeros for hours, minutes, and seconds
            let timeString = [];
            if (hrs > 0) timeString.push(hrs);
            if (mins > 0 || hrs > 0) timeString.push(mins.toString().padStart(2, '0'));
            timeString.push(secs.toString().padStart(2, '0'));

            return timeString.join(':');
        }

        function replaceTextInBraces(str, replacement) {
            return str.replace(/{[^}]*}/g, replacement);
        }


        let subButton = card.querySelector('.bubble-sub-button-1 .bubble-sub-button-name-container');
        if (subButton) {
          let text = subButton.innerText.trim();
          text = text.substring(0, text.length - 1);
          let keyValue = text.split(':');
          if (keyValue.length > 1) {
            subButton.innerText = replaceTextInBraces(subButton.innerText, addSecondsToNow(keyValue[1]));
          }
        }
      })()}
      `;
    // + helpers.wrapInBubbleCardStyleIIFE(
    //   `if (card.classList.contains('is-on')) {icon.classList.add('breathing-glow')} else {icon.classList.remove('breathing-glow')}`
    // )
    subbutton1 = {
      show_attribute: true,
      show_last_changed: false,
      show_state: false,
      show_name: true,
      show_icon: false,
      attribute: "autoreset_time_remaining",
      state_background: false,
      show_background: false,
      name: "Manual Override", // Todo: translation
      entity: adaptive_entity.entity_id,
      tap_action: {
        action: "perform-action",
        perform_action: "adaptive_lighting.set_manual_control",
        target: {},
        data: {
          manual_control: false,
          entity_id: adaptive_entity.entity_id,
        },
      },
      double_tap_action: {
        action: "none",
      },
      hold_action: {
        action: "none",
      },
    };
  }

  const subButton2 = {
    name: "Menu",
    show_background: false,
    icon: "mdi:menu",
  };

  return {
    type: "custom:bubble-card",
    card_layout: "large",
    card_type: "button",
    button_type: "slider",
    entity: entity_id,
    scrolling_effect: false,
    show_icon: true,
    force_icon: false,
    slider_live_update: false,
    sub_button: [subbutton1, subButton2],
    show_attribute: true,
    attribute: "brightness",
    styles: "",
    show_state: false,
    show_name,
    tap_action: {
      action: "toggle",
    },
    double_tap_action: {
      action: "more-info",
    },
    hold_action: {
      action: "more-info",
    },
    styles,
    modules: helpers.BUBBLE_MODULES,
  };
}

function newLights(thisAreasEntities) {
  const adaptive_entity = helpers
    .filterEntitiesByProperties(thisAreasEntities, {
      platform: "adaptive_lighting",
      domain: "switch",
    })
    .filter((entity) => {
      return entity.original_name.startsWith("Adaptive Lighting:");
    })[0]; // Todo: Check if this is language agnostic or if there is just a better way than using "original_name"

  const lights = thisAreasEntities.filter((item) => item.domain === "light");

  console.log(adaptive_entity);
  const cards = lights.map((light) => {
    return newLightBubble(light.entity_id, adaptive_entity, lights.length > 1);
  });
  return cards;
}

function newMotionControlsIconsOnly(area, thisAreasEntities) {
  // Todo: don't rely on entity id naming scheme
  // const motionActivated = `input_boolean.motion_lights_${area.area_id}`;
  // const motionActivated = `automation.magic_areas_light_${area.area_id}`;
  const presenceHold = `switch.magic_areas_presence_hold_${area.area_id}`;

  const motionActivated = thisAreasEntities.find(
    (x) =>
      x.domain === "switch" &&
      x.identifiers?.[0]?.[0] === "magic_areas" &&
      x.original_name == "Light Control" // TODO: Find a better way to do this as it might change but without this it will get the presence hold instead
  )?.entity_id;

  function subbutton(
    entityID,
    mainAdaptiveEntityId = undefined,
    dictToMerge = {}
  ) {
    let visibility = [];
    if (mainAdaptiveEntityId !== undefined) {
      visibility.push({
        condition: "state",
        entity: mainAdaptiveEntityId,
        state: "on",
      });
    }

    let button = {
      name: entityID,
      entity: entityID,
      tap_action: {
        action: "toggle",
      },
      visibility: visibility,
      hold_action: {
        action: "more-info",
      },
    };

    return { ...button, ...dictToMerge };
  }

  // Add the sub buttons
  let styles = "";
  const sub_buttons = [];
  const valid_entity_ids = thisAreasEntities.map((entity) => entity.entity_id);
  let presenceHoldVisibility = {};
  if (valid_entity_ids.includes(motionActivated)) {
    sub_buttons.push(subbutton(motionActivated));
    styles = `\${subButtonIcon[0].setAttribute("icon", hass.states['${motionActivated}'].state === 'on' ? 'mdi:motion-sensor' : 'mdi:motion-sensor-off')}`;

    presenceHoldVisibility = {
      visibility: {
        condition: "or",
        conditions: [
          {
            condition: "state",
            entity: motionActivated,
            state: "on",
          },
          {
            condition: "state",
            entity: presenceHold,
            state: "on",
          },
        ],
      },
    };
  }
  if (valid_entity_ids.includes(presenceHold)) {
    sub_buttons.push(
      subbutton(presenceHold, undefined, presenceHoldVisibility)
    );
  }

  // Return null if we have no sub buttons because this card is just sub buttons
  if (sub_buttons.length === 0) {
    return null;
  }

  return newBubbleIconButtons(sub_buttons, styles);
}

function spacer(columns) {
  return {
    type: "custom:bubble-card",
    card_type: "empty-column",
    columns,
  };
}

function newAdaptiveControlsIconsOnly(area, thisAreasEntities) {
  // Todo: don't rely on entity id naming scheme
  const adaptive = `switch.adaptive_lighting_${area.area_id}`;
  const autoBrightness = `switch.adaptive_lighting_adapt_brightness_${area.area_id}`;
  const autoColor = `switch.adaptive_lighting_adapt_color_${area.area_id}`;
  const sleepMode = `switch.adaptive_lighting_sleep_mode_${area.area_id}`;

  function subbutton(entityID, mainAdaptiveEntityId) {
    let visibility = [];
    if (mainAdaptiveEntityId !== undefined) {
      visibility.push({
        condition: "state",
        entity: mainAdaptiveEntityId,
        state: "on",
      });
    }

    let button = {
      name: entityID,
      entity: entityID,
      tap_action: {
        action: "toggle",
      },
      visibility: visibility,
      hold_action: {
        action: "more-info",
      },
    };

    return button;
  }

  // Add the sub buttons
  const sub_buttons = [];
  const valid_entity_ids = thisAreasEntities.map((entity) => entity.entity_id);
  if (valid_entity_ids.includes(adaptive)) {
    sub_buttons.push(subbutton(adaptive));

    if (valid_entity_ids.includes(autoBrightness)) {
      sub_buttons.push(subbutton(autoBrightness, adaptive));
    }
    if (valid_entity_ids.includes(autoColor)) {
      sub_buttons.push(subbutton(autoColor, adaptive));
    }
    if (valid_entity_ids.includes(sleepMode)) {
      sub_buttons.push(subbutton(sleepMode, adaptive));
    }

    sub_buttons.push({
      name: "Apply Now",
      icon: "mdi:auto-fix",
      show_name: false,
      show_last_changed: false,
      show_attribute: false,
      tap_action: {
        action: "perform-action",
        perform_action: "adaptive_lighting.apply",
        target: {},
        data: {
          entity_id: adaptive,
        },
      },
    });
  }

  // Return null if we have no sub buttons because this card is just sub buttons
  if (sub_buttons.length === 0) {
    return null;
  }

  return newBubbleIconButtons(sub_buttons, undefined, 4);
}

function newBubbleIconButtons(
  sub_buttons,
  styles = "",
  column_override = undefined
) {
  //TODO: there has to be a pure CSS way instead of setting justify and margin programmatically
  const icon_px = 46;
  // const min_columns = 3; // any less than 3 even with 1 sub button gets cut off on mobile. This is for grid options columns not bubble card columns
  const min_columns = 0; //
  const button_to_column_multiplier = 0.7; // TODO: make based of the icon sizes
  const justify_content =
    sub_buttons.length < 3 ? "space-evenly" : "space-between";
  const margin_right = sub_buttons.length === 2 ? "-3%" : "0px";

  const columns =
    column_override !== undefined
      ? column_override
      : Math.max(min_columns, sub_buttons.length * button_to_column_multiplier);

  return {
    type: "custom:bubble-card",
    card_type: "button",
    card_layout: "large",
    button_type: "name",
    show_icon: false,
    show_name: false,
    sub_button: sub_buttons,
    styles: `.card-content {\n  width: 100%;\n  margin: 0 !important;\n}\n\n.bubble-sub-button {\n  height: ${icon_px}px !important;\n  width: ${icon_px}px !important;\n}\n.bubble-sub-button-container {\n  display: flex !important; width: 100%;\n  justify-content: ${justify_content} !important;\n}\n.bubble-sub-button-icon {\n  --mdc-icon-size: inherit !important;\n}\n.bubble-name-container {\n  margin-right: ${margin_right} !important;\n}\n${styles}`,
    columns,
  };
}

// function newAdaptiveControls(area) {
//   function newStyle(entityId) {
//     const onColor = "var(--bubble-accent-color, var(--accent-color))";
//     const offColor = "var(--disabled-color)";

//     return `\${hass.states['${entityId}'].state === 'on' ?  '${onColor}'  : '${offColor}'} !important;`;
//   }

//   const adaptive = `switch.adaptive_lighting_${area.area_id}`;
//   const autoBrightness = `switch.adaptive_lighting_adapt_brightness_${area.area_id}`;
//   const autoColor = `switch.adaptive_lighting_adapt_color_${area.area_id}`;
//   const sleepMode = `switch.adaptive_lighting_sleep_mode_${area.area_id}`;
//   // const motionActivated = `switch.motion_lights_${area.area_id}`;
//   const motionActivated = `switch.magic_areas_presence_hold_${area.area_id}`;

//   let styles = ".bubble-button-background {\n  opacity: 0 !important;\n}\n";
//   styles += `.bubble-sub-button-1 {\n  color: ${newStyle(autoBrightness)}\n}`;
//   styles += `.bubble-sub-button-2 {\n  color: ${newStyle(autoColor)}\n}`;
//   styles += `.bubble-sub-button-3 {\n  color: ${newStyle(sleepMode)}\n}`;
//   styles += `.bubble-sub-button-4 {\n  color: ${newStyle(motionActivated)}\n}`;

//   return {
//     type: "custom:bubble-card",
//     card_type: "button",
//     entity: adaptive,
//     grid_options: {
//       rows: 1,
//       columns: "full",
//     },
//     show_name: true,
//     show_icon: true,
//     scrolling_effect: true,
//     show_attribute: false,
//     name: "Smart Lights",
//     sub_button: [
//       {
//         entity: autoBrightness,
//         state_background: true,
//         show_name: true,
//         name: "Brightness",
//         show_background: false,
//         show_icon: true,
//         show_state: false,
//         tap_action: {
//           action: "toggle",
//         },
//         visibility: [
//           {
//             condition: "state",
//             entity: adaptive,
//             state: "on",
//           },
//         ],
//       },
//       {
//         entity: autoColor,
//         show_icon: true,
//         state_background: false,
//         show_state: false,
//         show_name: true,
//         name: "Color",
//         tap_action: {
//           action: "toggle",
//         },
//         visibility: [
//           {
//             condition: "state",
//             entity: adaptive,
//             state: "on",
//           },
//         ],
//         show_background: false,
//       },
//       {
//         entity: sleepMode,
//         name: "Sleep Mode",
//         show_name: true,
//         show_attribute: false,
//         show_last_changed: false,
//         state_background: true,
//         show_background: false,
//         show_state: false,
//         visibility: [
//           {
//             condition: "state",
//             entity: adaptive,
//             state: "on",
//           },
//         ],
//         tap_action: {
//           action: "toggle",
//         },
//       },
//       {
//         entity: motionActivated,
//         state_background: true,
//         show_name: true,
//         name: "Motion",
//         show_background: false,
//         show_icon: true,
//         show_state: false,
//         tap_action: {
//           action: "toggle",
//         },
//       },
//     ],
//     show_state: true,
//     card_layout: "large-2-rows",
//     force_icon: false,
//     show_last_changed: false,
//     tap_action: {
//       action: "toggle",
//     },
//     styles: styles,
//   };
// }

function newAreaTemperatureGraph(area, thisAreasEntities) {
  // Todo: remove hard coding and don't rely on entity id naming scheme
  const room = `sensor.magic_areas_aggregates_${area.area_id}_aggregate_temperature`;
  const home = "sensor.magic_areas_aggregates_interior_aggregate_temperature";
  const outdoor = "sensor.outdoor_temperature";

  // Return null if we don't have a room temperature as the whole point is to show the temperature of this room
  const valid_entity_ids = thisAreasEntities.map((entity) => entity.entity_id);
  if (!valid_entity_ids.includes(room)) {
    return null;
  }

  return [
    {
      type: "custom:mini-graph-card",
      entities: [
        {
          entity: room,
          name: area.name,
          show_state: true,
        },
        {
          entity: home,
          name: "Indoor",
          show_state: true,
          show_fill: false,
        },
        // {
        //   entity: outdoor,
        //   name: "Outdoor",
        //   y_axis: "secondary",
        //   show_state: true,
        //   show_fill: false,
        // },
      ],
      hours_to_show: 24,
      animate: true,
      color_thresholds: [
        {
          value: 65,
          color: "aqua",
        },
        {
          value: 68,
          color: "#00ff00",
        },
        {
          value: 72,
          color: "orange",
        },
        {
          value: 76,
          color: "red",
        },
      ],
      show: {
        icon: false,
        name: false,
        extrema: true,
        average: true,
        fill: "fade",
      },
      decimals: 0,
      points_per_hour: 1,
    },
  ];
}

/**
 * @returns {array} - Array of litterbot cards or null if no litterbot are found
 */
function litterbotCards(entities) {
  const cards = [];

  // Get all the proper vacuum entities
  const litterrobots = helpers.filterEntitiesByProperties(entities, {
    platform: "litterrobot",
    domain: "vacuum",
  });

  // Iterate over each litter robot and generate a card for it
  litterrobots.forEach((litterrobot) => {
    const related_entities = helpers.filterEntitiesByProperties(entities, {
      device_id: litterrobot.device_id,
    });

    // TODO: make this not based on entity_id since that can be changed by the user
    const litter_level = related_entities.filter((e) =>
      e.entity_id.endsWith("_litter_level")
    )[0];
    const waste_drawer = related_entities.filter((e) =>
      e.entity_id.endsWith("_waste_drawer")
    )[0];
    const status_code = related_entities.filter((e) =>
      e.entity_id.endsWith("_status_code")
    )[0];
    const pet_weight = related_entities.filter((e) =>
      e.entity_id.endsWith("_pet_weight")
    )[0];

    // Update the icon to have a cat in it if its in Cat Sensor Timing
    let styles = `\${icon.setAttribute("icon", ['cst', 'cd'].includes(hass.states['${status_code.entity_id}'].state) ? 'phu:litter-robot' : 'phu:litter-robot-empty')}`; // TODO: fall back to mdi icons if window.customIcons.phu does not exist. Or better yet, find a WebSocket call or something to check for installed HACs resources but if we go that way, ensure manual installs still work

    // Make it glow when there is an error
    styles += helpers.wrapInBubbleCardStyleIIFE(`
      if (hass.states['${litterrobot.entity_id}'].state === 'error') {
        card.style.setProperty('--glow-color', 'var(--error-color)');
        card.classList.add('breathing-glow-alt')
      } else {
        card.style.removeProperty('--glow-color');
        card.classList.remove('breathing-glow-alt')
      }

      const nearly_full = 75;
      const nearly_empty = 60;

      const litter_button = card.querySelector('.bubble-sub-button-1');
      if (hass.states['${litter_level.entity_id}'].state <= nearly_full) {
        litter_button.style.setProperty('--glow-color', 'var(--warning-color)');
        litter_button.classList.add('breathing-glow-alt')
      } else if (hass.states['${litter_level.entity_id}'].state <= nearly_empty) {
        litter_button.style.setProperty('--glow-color', 'var(--error-color)');
        litter_button.classList.add('breathing-glow-alt')
      } else {
        litter_button.style.removeProperty('--glow-color');
        litter_button.classList.remove('breathing-glow-alt')
      }

      const waste_button = card.querySelector('.bubble-sub-button-2');
      if (hass.states['${waste_drawer.entity_id}'].state >= nearly_full) {
        waste_button.style.setProperty('--glow-color', 'var(--warning-color)');
        waste_button.classList.add('breathing-glow-alt')
      } else if (hass.states['${litter_level.entity_id}'].state <= nearly_empty) {
        waste_button.style.setProperty('--glow-color', 'var(--error-color)');
        waste_button.classList.add('breathing-glow-alt')
      } else {
        waste_button.style.removeProperty('--glow-color');
        waste_button.classList.remove('breathing-glow-alt')
      }
    `);
    styles += helpers.bubbleCSSImport();

    // Make the name subtext field where an attribute usually is instead have the current status code
    const styles_iife = `const bubbleNameContainer = card.querySelector('.bubble-state.state.display-state .scrolling-container');if (bubbleNameContainer) { bubbleNameContainer.innerText = hass.formatEntityState(hass.states['${status_code.entity_id}']);}\n`;
    // styles = `const bubbleNameContainer = card.querySelector('.bubble-state.state.display-state .scrolling-container');if (bubbleNameContainer) { bubbleNameContainer.innerHTML = bubbleNameContainer.innerHTML.replace(/${litterrobot.attributes.friendly_name}/g, hass.formatEntityState(hass.states['${status_code.entity_id}']) );}`
    // styles = `const bubbleNameContainer = card.querySelector('.bubble-state.state.display-state .scrolling-container');if (bubbleNameContainer) { bubbleNameContainer.innerHTML = bubbleNameContainer.innerHTML.replace(/hass.states['${litterrobot.entity_id}'].attributes.friendly_name}/g, hass.formatEntityState(hass.states['${status_code.entity_id}']) );}`

    // styles = helpers.wrapInBubbleCardStyleIIFE(styles)
    // styles = styles + "\n" + helpers.wrapInBubbleCardStyleIIFE(styles_iife);

    // Create some default options to be shared across the subbuttons
    const subbutton_options = {
      show_name: true,
      show_attribute: false,
      show_icon: true,
      state_background: false,
      show_background: false,
      show_state: true,
    };
    const subbutton_spacer = {
      name: " ",
      show_name: false,
      show_attribute: false,
      show_icon: false,
      state_background: false,
      show_background: false,
      show_state: false,
    };

    const weight_button = {
      ...subbutton_options,
      ...{
        name: "Weight",
        entity: pet_weight.entity_id,
        show_name: false,
        show_icon: true,
        icon: "mdi:cat",
      },
    };

    // TODO: only add entities we actually find instead of assuming we found them
    cards.push({
      type: "custom:bubble-card",
      card_type: "button",
      button_type: "state",
      entity: litterrobot.entity_id,
      sub_button: [
        {
          entity: litter_level.entity_id,
          show_name: true,
          name: "Litter",
          show_attribute: false,
          show_icon: true,
          state_background: false,
          show_background: false,
          show_state: true,
        },
        {
          entity: waste_drawer.entity_id,
          name: "Waste",
          show_name: true,
          state_background: false,
          show_background: false,
          show_state: true,
        },
        // weight_button, // TODO: find a way to display weight data without covering up the status
        // {
        //   entity: status_code.entity_id,
        //   show_name: false,
        //   show_last_changed: false,
        //   name: "Status",
        //   show_state: true,
        //   state_background: false,
        //   show_background: false,
        //   show_attribute: false,
        //   attribute: "options",
        //   show_icon: false,
        //   visibility: [
        //     {
        //       condition: "state",
        //       entity: status_code.entity_id,
        //       state_not: "rdy",
        //     },
        //   ],
        // },
      ],
      card_layout: "large-2-rows",
      show_state: false,
      show_attribute: true,
      attribute: "friendly_name",
      show_last_changed: false, // Setting to true will cause the status_code replacement to flicker
      columns: 4, // TODO: change to 3 but enable a text scrolling safe replacement for the status
      styles,
      modules: [...helpers.BUBBLE_MODULES, "get_state_attribute"],
      get_state_attribute: [
        {
          entity: status_code.entity_id,
        },
        {},
        {},
        {},
      ],
    });
  });

  // Return null if we have no cards
  if (cards.length === 0) {
    return null;
  }

  // Add the header
  // TODO: Auto detect if this should be "Cats", "Dogs", or "Pets"
  cards.unshift(sectionHeader("mdi:cat", "Cats"));

  // Return the cards
  return cards;
}

function vacuumCards(entities) {
  const cards = [];

  // Get all the proper vacuum entities
  const banned_platforms = ["litterrobot"];
  const vacuums = helpers
    .filterEntitiesByProperties(entities, { domain: "vacuum" })
    .filter((entity) => !banned_platforms.includes(entity.platform));

  // Iterate over each vacuum and create a card for it
  vacuums.forEach((vacuum) => {
    const related_entities = helpers.filterEntitiesByProperties(entities, {
      device_id: vacuum.device_id,
    });

    console.log(related_entities);

    const visibility_is_moving = {
      condition: "or",
      conditions: [
        {
          condition: "state",
          entity: vacuum.entity_id,
          state: "returning",
        },
        {
          condition: "state",
          entity: vacuum.entity_id,
          state: "cleaning",
        },
      ],
    };

    const battery_entity = related_entities.filter(
      (e) => e.attributes?.device_class === "battery"
    )[0];

    const status_code = related_entities.filter(
      (e) => e.translation_key === "status" // TODO: Check other vacuum integrations and ensure this works for more than just roborock
    )[0];

    const error_sensors = related_entities.filter(
      (e) => e.entity_id.endsWith("_error") // TODO: Check other vacuum integrations and ensure this works for more than just roborock
    );

    const error_buttons = error_sensors.map((e) => ({
      entity: e.entity_id,
      show_attribute: false,
      show_state: true,
      show_name: false,
      name: e.attributes.friendly_name,
      show_icon: false,
      state_background: false,
      show_background: false,
      visibility: [
        {
          condition: "and",
          conditions: [
            {
              condition: "state",
              entity: e.entity_id,
              state_not: "none",
            },
            {
              condition: "state",
              entity: e.entity_id,
              state_not: "ok",
            },
            {
              condition: "state",
              entity: e.entity_id,
              state_not: "idle",
            },
            {
              condition: "state",
              entity: e.entity_id,
              state_not: "off",
            },
          ],
        },
      ],
    }));

    const battery_button = {
      entity: battery_entity.entity_id, // TODO: don't assume the entity exists
      show_attribute: false,
      show_state: true,
      show_name: false,
      name: "Battery",
      show_icon: true,
      state_background: false,
      show_background: false,
      visibility: [
        {
          condition: "state",
          entity: battery_entity.entity_id,
          state_not: "100",
        },
      ],
    };

    const progress_button = {
      entity: related_entities.filter(
        (e) => e.original_name === "Cleaning progress"
      )[0].entity_id, // TODO: don't assume the entity exists. Find a more universal way to identify
      show_attribute: true,
      show_state: true,
      show_name: false,
      name: "Cleaning Progress",
      show_icon: true,
      visibility: [
        {
          condition: "state",
          entity: vacuum.entity_id,
          state_not: "docked",
        },
      ],
      icon: "mdi:vacuum",
      state_background: true,
      show_background: false,
    };

    const start_button = {
      name: "Start",
      icon: "mdi:play",
      tap_action: {
        action: "call-service",
        target: {
          entity_id: "entity",
        },
        service: "vacuum.start",
      },
      visibility: [
        {
          condition: "state",
          entity: vacuum.entity_id,
          state_not: "cleaning",
        },
        {
          condition: "state",
          entity: vacuum.entity_id,
          state_not: "returning",
        },
      ],
    };

    const locate_button = {
      name: "Locate",
      icon: "mdi:map-marker-question",
      show_last_changed: false,
      tap_action: {
        action: "call-service",
        target: {
          entity_id: "entity",
        },
        service: "vacuum.locate",
      },
      visibility: [
        {
          condition: "state",
          entity: vacuum.entity_id,
          state_not: "docked",
        },
      ],
    };

    const pause_button = {
      name: "Pause",
      icon: "mdi:pause",
      state_background: true,
      show_background: true,
      visibility: [visibility_is_moving],
      tap_action: {
        action: "call-service",
        target: {
          entity_id: "entity",
        },
        service: "vacuum.pause",
      },
    };

    const stop_button = {
      name: "Stop",
      icon: "mdi:stop",
      state_background: true,
      show_background: true,
      visibility: [visibility_is_moving],
      tap_action: {
        action: "call-service",
        target: {
          entity_id: "entity",
        },
        service: "vacuum.stop",
      },
    };

    const dock_button = {
      name: "Dock",
      icon: "mdi:home-import-outline",
      show_last_changed: false,
      tap_action: {
        action: "call-service",
        target: {
          entity_id: "entity",
        },
        service: "vacuum.return_to_base",
      },
      visibility: [
        {
          condition: "state",
          entity: vacuum.entity_id,
          state_not: "docked",
        },
        {
          condition: "state",
          entity: vacuum.entity_id,
          state_not: "returning",
        },
      ],
    };

    // Styling to not colorize the battery
    const animation = `if (icon.getAttribute('icon') !== 'mdi:robot-vacuum') { icon.setAttribute('icon', "mdi:robot-vacuum")}`;
    // const animation = `if (['cleaning','returning'].includes(hass.states['${vacuum.entity_id}'].state)) {icon.classList.add("robot-vacuum")} else {icon.classList.remove("robot-vacuum")}`;
    // const animation = `if (hass.states['${status_code.entity_id}'].state === 'cleaning') {icon.classList.add("robot-vacuum")} else {icon.classList.remove("robot-vacuum")}`;
    // const animation = `icon.classList.add("robot-vacuum-circle-only")`;
    // const show_docked_if_fully_charged = `
    // if (hass.states['${status_code.entity_id}'].state === 'charging' && hass.states['${battery_entity.entity_id}'].state == 100) { // state might be string or int
    //   card.querySelector('.bubble-state').innerText = hass.formatEntityState(hass.states['${vacuum.entity_id}'])
    // }
    // `;
    const show_docked_if_fully_charged = `
    let desired_modules = []
    if (hass.states['${status_code.entity_id}'].state === 'charging' && hass.states['${battery_entity.entity_id}'].state == 100) { // state might be string or int
      desired_modules = this.config.modules.filter(item => item !== "get_state_attribute")  
    } else {
      desired_modules = [...this.config.modules];
      if (!desired_modules.includes("get_state_attribute")) {
          desired_modules.push("get_state_attribute");
      }
    }

    // Since we are only adding and removing the last module, we can just compare the length
    if (this.config.modules.length !== desired_modules.length) { this.config.modules = desired_modules; }
    `;

    // Add a glow if theres any errors
    // Only works because the error buttons are first
    const error_glow_whole_card = `
      let has_error = false;
      for (i=1; i<= ${error_buttons.length}; i++ ) {
        const container = card.querySelector(\`.bubble-sub-button-\${i}\`)
        if (!container.classList.contains('hidden')) {
          has_error = true;
          card.style.setProperty('--glow-color', 'var(--error-color)');
          break;
        }
      }
      card.classList.toggle('breathing-glow-alt', has_error) 
    `;

    const styles = helpers.wrapInBubbleCardStyleIIFE(
      animation,
      show_docked_if_fully_charged,
      error_glow_whole_card
    );

    cards.push({
      type: "custom:bubble-card",
      card_type: "button",
      button_type: "state",
      entity: vacuum.entity_id,
      scrolling_effect: false,
      show_attribute: false,
      sub_button: [
        ...error_buttons,
        battery_button,
        progress_button,
        start_button,
        pause_button,
        // stop_button,
        dock_button,
      ],
      card_layout: "large",
      columns: 4,
      styles,
      modules: [...helpers.BUBBLE_MODULES, "get_state_attribute"],
      get_state_attribute: [
        {
          entity: status_code.entity_id, // TODO: don't assume the entity exists
        },
        {},
        {},
        {},
      ],
    });
  });

  // Return null if we have no cards
  if (cards.length === 0) {
    return null;
  }

  // Add the header
  cards.unshift(sectionHeader("mdi:vacuum", "Cleaning"));

  // Return the cards
  return cards;
}

function AutomationGrid(entities) {
  function card(entity) {
    const toggle = {
      action: "toggle",
      confirmation: {
        text: `This will toggle automation '${entity.attributes.friendly_name}'.`,
      },
    };

    // TODO: Replace buttons with a hamburger menu that opens a popup with the buttons
    return {
      type: "custom:bubble-card",
      card_type: "button",
      modules: helpers.BUBBLE_MODULES,
      entity: entity.entity_id,
      sub_button: [
        {
          entity: entity.entity_id,
          show_name: false,
          name: "Trigger",
          icon: "mdi:play",
          show_state: false,
          state_background: false,
          tap_action: {
            action: "call-service",
            target: {
              entity_id: "entity",
            },
            data: {
              skip_condition: false,
            },
            service: "automation.trigger",
            confirmation: {
              text: `This will run automation '${entity.attributes.friendly_name}'.`,
            },
          },
          show_last_updated: false,
          show_last_changed: false,
          show_attribute: false,
          attribute: "icon",
        },
        // {
        //   entity: entity.entity_id,
        //   show_name: false,
        //   name: "Force Trigger",
        //   icon: "mdi:flash",
        //   show_state: false,
        //   state_background: false,
        //   tap_action: {
        //     action: "call-service",
        //     target: {
        //       entity_id: "entity",
        //     },
        //     data: {
        //       skip_condition: true,
        //     },
        //     service: "automation.trigger",
        //     confirmation: {
        //       text: `This will run automation '${entity.attributes.friendly_name}' regardless of current conditions.`,
        //     },
        //   },
        //   show_last_updated: false,
        //   show_last_changed: false,
        //   show_attribute: false,
        //   attribute: "icon",
        // },
        {
          entity: entity.entity_id,
          show_name: false,
          name: "Toggle Button",
          icon: "mdi:power",
          state_background: false,
          show_state: true,
          tap_action: toggle,
          show_last_updated: false,
          show_last_changed: false,
        },
      ],
      card_layout: "large",
      styles: ".bubble-button-background {opacity: 0 !important;}",
      show_attribute: true,
      show_last_updated: false,
      show_last_changed: false,
      tap_action: toggle,
      attribute: "last_triggered",
      button_action: {
        tap_action: toggle,
      },
      double_tap_action: {
        action: "none",
      },
      hold_action: {
        action: "none",
      },
    };
  }

  const automations = helpers
    .filterEntitiesByProperties(entities, {
      domain: "automation",
    })
    .filter((x) => !x.entity_id.startsWith("automation.magic_areas_light_"))
    .sort((a, b) => {
      const nameA = a.attributes?.friendly_name?.toLowerCase() || "";
      const nameB = b.attributes?.friendly_name?.toLowerCase() || "";
      return nameA.localeCompare(nameB);
    });

  // Create a card for each automation
  const cards = automations.map((automation) => card(automation));

  // Return null if we have no cards
  if (cards.length === 0) {
    return null;
  }

  // Add the header
  cards.unshift(sectionHeader("mdi:robot", "Automations"));

  // Create grid to store the cards in
  return helpers.newGrid(cards);
}

function sectionHeader(icon, name, styles = undefined) {
  return {
    type: "custom:bubble-card",
    card_type: "separator",
    modules: ["default"],
    name,
    icon,
    card_layout: "normal",
    styles,
  };
}

function DailyLogCard(
  entity,
  history,
  hidden_state,
  date_format,
  minimal_duration
) {
  const config = {
    type: "custom:logbook-card",
    entity: entity,
  };

  if (history !== undefined) {
    config.history = history;
  }

  if (hidden_state !== undefined) {
    config.hidden_state = hidden_state;
  }

  if (date_format !== undefined) {
    config.date_format = date_format;
  }

  if (minimal_duration !== undefined) {
    config.minimal_duration = minimal_duration;
  }

  return config;
}

function AreaStatePopUp(area, area_state_entity) {
  function state_bubble_card(entity_id) {
    return {
      type: "custom:bubble-card",
      card_type: "button",
      modules: ["default"],
      button_type: "state",
      entity: entity_id,
      show_last_changed: true,
    };
  }

  function multi_log_card(entities, area_state_entity_id) {
    let e = entities.map((entity) => {
      return {
        entity: entity,
        hidden_state: ["unavailable", "off"],
      };
    });

    e.push({
      entity: area_state_entity_id,
      hidden_state: ["unavailable", "unknown", "on"],
    });

    return {
      type: "custom:multiple-logbook-card",
      title: "Source Sensors' History",
      history: 1,
      date_format: "hh:mm A",
      entities: e,
    };
  }

  // Return null if we dont have an area_state_entity
  if (area_state_entity === undefined) {
    return null;
  }

  const MORE_INFO_CARD = {
    type: "custom:more-info-card",
    entity: area_state_entity.entity_id,
    title: area.name,
  };

  const presenceHold = `switch.magic_areas_presence_hold_${area.area_id}`;
  const state_bubble_cards = [...area_state_entity.attributes.presence_sensors]
    .sort()
    .filter((x) => x != presenceHold) // We later put it at the top
    .map((x) => state_bubble_card(x));

  return {
    type: "vertical-stack",
    cards: [
      {
        type: "custom:bubble-card",
        card_type: "pop-up",
        modules: ["default"],
        hash: "#occupancy",
        show_header: true,
        button_type: "state",
        entity: area_state_entity.entity_id,
        name: area.name,
        trigger_close: false,
        icon: "",
        show_name: true,
        show_last_changed: true,
        show_attribute: true,
        attribute: "states",
        show_state: false,
        sub_button: [
          {
            entity: presenceHold,
            show_state: false,
            show_name: false,
            name: "Presence Hold",
            show_attribute: false,
            show_last_updated: false,
            show_last_changed: false,
            tap_action: {
              action: "toggle",
            },
          },
        ],
      },
      // MORE_INFO_CARD,
      state_bubble_card(presenceHold),
      ...state_bubble_cards,
      DailyLogCard(
        area_state_entity.entity_id,
        1,
        ["unavailable", "off"],
        "hh:mm A",
        1
      ),
      multi_log_card(
        [...area_state_entity.attributes.presence_sensors],
        area_state_entity.entity_id
      ),
    ],
  };
}

function temperatureCard(mergedEntityMetadata, area) {
  const area_temperature_entity = helpers.filterEntitiesByProperties(
    mergedEntityMetadata,
    {
      domain: "sensor",
      translation_key: "aggregate_temperature",
      platform: "magic_areas",
      area_id: area.area_id,
    }
  )[0];

  if (area_temperature_entity === undefined) {
    return null;
  }

  const interior_temperature_entity = helpers
    .filterEntitiesByProperties(mergedEntityMetadata, {
      domain: "sensor",
      translation_key: "aggregate_temperature",
      platform: "magic_areas",
    })
    .find((x) => {
      return x.identifiers?.[0]?.[1] === "magic_area_device_interior";
    });

  const outdoor_temperature_entity =
    mergedEntityMetadata["sensor.outdoor_temperature"];
  let outdoor_icon_threshold;
  switch (outdoor_temperature_entity.attributes.unit_of_measurement) {
    case "°F":
      outdoor_icon_threshold = 32;
      break;
    case "°C":
      outdoor_icon_threshold = 0;
      break;
    case "K":
      outdoor_icon_threshold = 273.15;
      break;
    default:
      outdoor_icon_threshold = 32; // default to Fahrenheit threshold if unit is unrecognized. TODO: Default to HA's default
  }

  const outdoor_icon =
    outdoor_temperature_entity.state > outdoor_icon_threshold
      ? "mdi:sun-thermometer"
      : "mdi:snowflake-thermometer";

  const sub_button = [];
  if (interior_temperature_entity !== undefined) {
    sub_button.push({
      entity: interior_temperature_entity.entity_id,
      name: "Indoors",
      show_name: true,
      show_state: true,
      state_background: false,
      show_background: true,
    });
  }

  if (outdoor_temperature_entity !== undefined) {
    sub_button.push({
      entity: outdoor_temperature_entity.entity_id,
      name: "Outdoors",
      show_name: true,
      show_state: true,
      state_background: false,
      show_background: true,
      icon: outdoor_icon,
    });
  }

  return {
    type: "custom:bubble-card",
    card_type: "button",
    modules: helpers.BUBBLE_MODULES,
    auto_order: false,
    button_type: "state",
    entity: area_temperature_entity.entity_id,
    name: "Temperature",
    show_state: true,
    show_last_changed: false,
    show_name: false,
    sub_button,
    card_layout: "large",
    grid_options: {
      columns: "full",
      rows: 1,
    },
    styles: helpers.wrapInBubbleCardStyleIIFE(
      helpers.bubbleStyleConditional2Row(`window.innerWidth <= ${helpers.WIDE}`)
    ),
  };
}

function humidityCard(mergedEntityMetadata, area) {
  const filter = {
    domain: "sensor",
    translation_key: "aggregate_humidity",
    platform: "magic_areas",
  };

  const area_entity = helpers.filterEntitiesByProperties(mergedEntityMetadata, {
    ...filter,
    area_id: area.area_id,
  })[0];

  if (area_entity === undefined) {
    return null;
  }

  const interior_entity = helpers
    .filterEntitiesByProperties(mergedEntityMetadata, filter)
    .find((x) => {
      return x.identifiers?.[0]?.[1] === "magic_area_device_interior";
    });

  const outdoor_entity = mergedEntityMetadata["sensor.main_weather_humidity"];

  const sub_button = [];
  if (interior_entity !== undefined) {
    sub_button.push({
      entity: interior_entity.entity_id,
      name: "Indoors",
      show_name: true,
      show_state: true,
      state_background: false,
      show_background: true,
    });
  }
  if (outdoor_entity !== undefined) {
    sub_button.push({
      entity: outdoor_entity.entity_id,
      name: "Outdoors",
      show_name: true,
      show_state: true,
      state_background: false,
      show_background: true,
      icon: "mdi:cloud-percent",
    });
  }

  return {
    type: "custom:bubble-card",
    card_type: "button",
    modules: helpers.BUBBLE_MODULES,
    auto_order: false,
    button_type: "state",
    entity: area_entity.entity_id,
    name: "Humidity",
    show_state: true,
    show_last_changed: false,
    show_name: false,
    sub_button,
    card_layout: "large",
    grid_options: {
      columns: "full",
      rows: 1,
    },
    styles: helpers.wrapInBubbleCardStyleIIFE(
      helpers.bubbleStyleConditional2Row(`window.innerWidth <= ${helpers.WIDE}`)
    ),
  };
}

function carbonDioxideCard(mergedEntityMetadata, area) {
  const filter = {
    domain: "sensor",
    translation_key: "aggregate_carbon_dioxide",
    platform: "magic_areas",
  };

  const area_entity = helpers.filterEntitiesByProperties(mergedEntityMetadata, {
    ...filter,
    area_id: area.area_id,
  })[0];

  if (area_entity === undefined) {
    return null;
  }

  const interior_entity = helpers
    .filterEntitiesByProperties(mergedEntityMetadata, filter)
    .find((x) => {
      return x.identifiers?.[0]?.[1] === "magic_area_device_interior";
    });

  const sub_button = [];
  if (interior_entity !== undefined) {
    sub_button.push({
      entity: interior_entity.entity_id,
      name: "Indoors",
      show_name: true,
      show_state: true,
      state_background: false,
      show_background: true,
    });
  }

  return {
    type: "custom:bubble-card",
    card_type: "button",
    modules: helpers.BUBBLE_MODULES,
    auto_order: false,
    button_type: "state",
    entity: area_entity.entity_id,
    name: "Carbon Dioxide",
    show_state: true,
    show_last_changed: false,
    show_name: false,
    sub_button,
    card_layout: "large",
    grid_options: {
      columns: "full",
      rows: 1,
    },
    styles: helpers.wrapInBubbleCardStyleIIFE(
      helpers.bubbleStyleConditional2Row(`window.innerWidth <= ${helpers.WIDE}`)
    ),
  };
}

function climate_control_grid(mergedEntityMetadata, area) {
  let cards = [];

  // Add the header
  cards.push(sectionHeader("mdi:thermostat", "Climate Control"));

  // Add cards
  cards.push(temperatureCard(mergedEntityMetadata, area));
  cards.push(humidityCard(mergedEntityMetadata, area));
  cards.push(carbonDioxideCard(mergedEntityMetadata, area));

  // Get all the climate entities
  const climate_entities = helpers.filterEntitiesByProperties(
    mergedEntityMetadata,
    {
      domain: "climate",
      area_id: area.area_id,
    }
  );
  // Create a card for each climate entity
  climate_entities.forEach((climate_entity) => {
    cards.push(new_bubble_climate_card(climate_entity.entity_id));
  });

  // Remove null cards
  cards = cards.filter((x) => x !== null);

  // Return null if we only have the header
  if (cards.length === 1) {
    return null;
  }

  return helpers.newGrid(cards);
}

function new_bubble_climate_card(entity_id) {
  return {
    type: "custom:bubble-card",
    card_type: "climate",
    modules: helpers.BUBBLE_MODULES,
    entity: entity_id,
    sub_button: [
      {
        name: "HVAC modes menu",
        select_attribute: "hvac_modes",
        state_background: true,
        show_background: true,
        show_arrow: false,
        show_attribute: false,
      },
      {
        name: "Presets",
        select_attribute: "preset_modes",
        state_background: true,
        show_background: true,
        show_arrow: false,
        show_name: false,
        show_state: false,
        show_attribute: false,
        attribute: "preset_mode",
      },
      {
        entity: entity_id,
        name: "Current Temperature",
        icon: "mdi:thermometer",
        state_background: true,
        show_background: true,
        show_attribute: true,
        attribute: "current_temperature",
      },
    ],
    force_icon: false,
    show_name: false,
    show_state: false,
    show_last_changed: false,
    show_attribute: false,
    attribute: "hvac_action",
    rows: "1",
    card_layout: "large",
    show_last_updated: false,
    show_icon: true,
    scrolling_effect: true,
    styles:
      ".bubble-temperature-container { background-color: ${state !== 'off' ? 'var(--bubble-accent-color, var(--bubble-default-color))' : 'var(--bubble-climate-button-background-color, var(--bubble-secondary-background-color, var(--card-background-color, var(--ha-card-background))))'};}",
  };
}

customElements.define("ll-strategy-view-magic-area", AreaView);
