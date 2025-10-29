import * as helpers from "./helpers.js";

class PeopleView {
  static async generate(config, hass) {
    const { devices, entities, mergedEntityMetadata } = config;

    const sections = [];

    const people = helpers.filterEntitiesByProperties(mergedEntityMetadata, {
      domain: "person",
    });
    people.forEach((person) => {
      const cards = [
        SPACER_CARD,
        headerCard2(person, mergedEntityMetadata),
        phoneCard(person, mergedEntityMetadata),
        // alarmCard(person),
      ];
      helpers.AddCardMod(cards);
      sections.push(helpers.newGrid(cards));
    });

    const max_columns = Math.min(4, people.length);

    return {
      type: "sections",
      max_columns,
      sections,
      badges: [helpers.alertBadge()],
    };
  }
}

const SPACER_CARD = {
  type: "heading",
  icon: "",
  heading_style: "title",
  visibility: [
    {
      condition: "screen",
      media_query: "(min-width: 0px) and (max-width: 767px)",
    },
  ],
  grid_options: {
    rows: 0.25,
  },
};

function headerCard2(person, entities) {
  const sub_button = [];

  const time_to_home = `sensor.${person.attributes.id}_to_home`;
  if (time_to_home in entities) {
    sub_button.push({
      entity: time_to_home,
      name: "Time To Home",
      state_background: false,
      show_background: false,
      show_icon: true,
      show_state: true,
      show_name: false,
      show_attribute: false,
      show_last_updated: true,
      visibility: [
        {
          condition: "state",
          entity: person.entity_id,
          state_not: "home",
        },
      ],
    });
  }

  // TODO: be smarter about what device tracker we consider their phone
  // For now we try to use the first device tracker listed but guard if missing
  const phone_entity_id =
    person.attributes &&
    Array.isArray(person.attributes.device_trackers) &&
    person.attributes.device_trackers.length > 0
      ? person.attributes.device_trackers[0]
      : undefined;

  const phone_device_id =
    phone_entity_id && entities[phone_entity_id]
      ? entities[phone_entity_id].device_id
      : undefined;
  const phone_sensor_prefix = phone_entity_id.split(".")[1];
  const ble_sensor = `sensor.${phone_sensor_prefix}_ble_transmitter`;
  let ble_idx = undefined;
  let ble_area_sensor = undefined;

  // Get the Bluetooth Low Energy (BLE) area sensor from Bermuda
  if (
    phone_entity_id &&
    entities[ble_sensor] &&
    entities[ble_sensor].attributes &&
    entities[ble_sensor].attributes.id
  ) {
    const ble_uuid = entities[ble_sensor].attributes.id.replace(/-/g, "");
    ble_area_sensor = helpers.filterEntitiesByProperties(entities, {
      platform: "bermuda",
      // TODO: fall back to the normal "Area" sensor if this doesn't exist.
      // We use "Last Seen" because we only show this value if the device is at home and ble is on.
      // So even if its not currently seen by the BLE sensors, is likely still at its last seen area.
      unique_id: `${ble_uuid}_area_last_seen`,
    });
    console.log(ble_area_sensor);
  } else {
    console.warn(
      "BLE sensor or phone entity ID not found for person:",
      person.entity_id
    );
  }

  // Ensure ble_area_sensor is an array with at least one element before trying to access it
  const visible_when_ble_bad =
    Array.isArray(ble_area_sensor) && ble_area_sensor.length > 0
      ? helpers.visibilityIsUnknownUnavailable(ble_area_sensor[0].entity_id)
      : helpers.visibilityIsUnknownUnavailable(person.entity_id);
  visible_when_ble_bad["conditions"].push({
    condition: "state",
    entity: ble_sensor,
    state_not: "Transmitting",
  });

  // TODO: make the tap action of the location name open a popup with the:
  // person entity
  // bermuda entity
  // place entity
  // Link to the map
  // From there the user can click on any of them to open the more info dialog
  const _location_matches = helpers.filterEntitiesByProperties(entities, {
    platform: "places",
    "attributes.devicetracker_entityid": person.entity_id,
  });
  const location =
    _location_matches && _location_matches[0] ? _location_matches[0] : person;
  sub_button.push({
    entity: location.entity_id,
    name: "Location",
    show_state: true,
    state_background: false,
    show_background: false,
    show_last_changed: false,
    show_icon: true,
    visibility: [visible_when_ble_bad], // TODO: handle visibility when ble_area_sensor is undefined
    // icon: locationIcon(entities, location, person),
  });

  // TODO: check if this still works for when ble_area_sensor is undefined
  if (Array.isArray(ble_area_sensor) && ble_area_sensor.length > 0) {
    ble_area_sensor = ble_area_sensor[0];
    console.log(ble_area_sensor.entity_id);
    sub_button.push({
      name: "BLE Area",
      entity: ble_area_sensor.entity_id,
      show_name: false,
      show_last_changed: false,
      show_state: true,
      show_icon: true,
      state_background: true,
      show_background: false,
      visibility: [
        // We check that BLE is transmitting because bermuda can take a little longer to switch to unknown
        {
          condition: "state",
          entity: ble_sensor,
          state: "Transmitting",
        },
        helpers.visibilityNotUnknownUnavailable(ble_area_sensor.entity_id),
      ],
    });
    ble_idx = sub_button.length - 1;
  }

  // Add a link to the underlying phone device (if we have a device id)
  if (phone_device_id) {
    sub_button.push({
      name: "Phone Link",
      icon: "mdi:information-variant-circle-outline",
      state_background: false,
      show_background: false,
      tap_action: {
        action: "navigate",
        navigation_path: `/config/devices/device/${phone_device_id}`,
      },
    });
  }

  const bubble_icon = {
    "background-image": `url("${person.attributes.entity_picture}")`,
    "background-size": "cover",
    "--mdc-icon-size": "48px !important",
    "clip-path": "circle()",
    "margin-left": "0px !important",
    "margin-right": "3% !important",
  };
  let styles = `
  .bubble-icon {
    ${Object.entries(bubble_icon)
      .map(([key, value]) => `${key}: ${value};`)
      .join("\n    ")}
  }
  .bubble-name-container {
    margin-right: 0px !important;
  }
`;

  // Make it dynamically switch to "large-2-rows" if theres 2 items
  // We don't always have it that way because if theres only 1,
  // then its not vertically centered
  styles += helpers.wrapInBubbleCardStyleIIFE(
    // Make 2 row on small screens
    helpers.bubbleStyleConditional2Row(
      `(hass.states['${person.entity_id}'].state !== 'home') & (window.innerWidth <= 480)`
    ),

    // Hide name when too small
    `
    if ((hass.states['${person.entity_id}'].state !== 'home') & (window.innerWidth <= 480)) {
      card.querySelector(".bubble-name").style.display = 'none';
    } else {
      card.querySelector(".bubble-name").style.removeProperty('display');
    }
    `,

    // Make profile pic clickable
    `
    const clickable = card.querySelector('.bubble-icon');
    if (clickable.style.cursor !== 'pointer') {
      clickable.style.cursor = 'pointer';
      clickable.addEventListener("click", function() {
        const event = new Event('hass-more-info', { bubbles: false, composed: true });

        // Dispatch the event with the entity ID
        event.detail = { entityId: '${person.entity_id}' };
        card.dispatchEvent(event);
      });
    }
`,
    // Hide last updated conditionally
    `
    // Only show "last updated" on time to home sensor when it hasn't been updated in lastUpdatedLimitMinutes minutes
    const lastUpdatedLimitMinutes = 6;
    const lastUpdatedLimit = new Date(Date.now() - lastUpdatedLimitMinutes * 60 * 1000);
    const time_to_home_updated_recently = new Date(hass.states['${time_to_home}'].last_updated) >= lastUpdatedLimit;
    if (time_to_home_updated_recently) {
      const button = card.querySelector(".bubble-sub-button-1 .bubble-sub-button-name-container");
      button.textContent = button.textContent.replace(/\\s·\\s\\d+\\s\\w+\\sago/, '')
    }
`,
    // Update icon based on place type if not zone
    `
    // Var to hold new icon
    let location_based_icon;
    const location = hass.states['${location.entity_id}'];

    // If you are in a zone, use that zone's id
    const person_state = hass.states['${person.entity_id}'].state;
    if (person_state !== 'not_home') {
      const zone_id = \`zone.\${person_state}\`; // TODO: Fix when this bug is fixed https://github.com/home-assistant/core/issues/123504#issuecomment-2676563143
      try { location_based_icon = hass.states[zone_id].attributes.icon; } catch {}
    }

    // We are not in a zone so let's get an icon based on the place_type
    else if (location?.attributes?.place_type) {
      switch (location.attributes.place_type.toLowerCase()) { // Todo: see if we can get the higher level of place type like 'shop' instead of 'supermarket'
        case "house":
          location_based_icon = "mdi:home-switch";
          break;
        case "store":
        case "shopping":
        case "supermarket":
          location_based_icon = "mdi:store";
          break;
        case "restaurant":
          location_based_icon = "mdi:food";
          break;
        case "cafe":
          location_based_icon = "mdi:coffee";
          break;
        case "bar":
          location_based_icon = "mdi:beer";
          break;
        case "park":
          location_based_icon = "mdi:tree";
          break;
        case "school":
          location_based_icon = "mdi:school";
          break;
        case "hospital":
          location_based_icon = "mdi:hospital";
          break;
        case "bank":
          location_based_icon = "mdi:bank";
          break;
        case "post_office":
          location_based_icon = "mdi:mailbox";
          break;
        case "place_of_worship":
          location_based_icon = "mdi:church";
          break;
        case "theater":
          location_based_icon = "mdi:theater";
          break;
        case "gym":
          location_based_icon = "mdi:dumbbell";
          break;
        case "gas_station":
          location_based_icon = "mdi:gas-station";
          break;
        case "pharmacy":
          location_based_icon = "mdi:prescription";
          break;
      } // End switch
  } // End if place_type exists

  // Update the icon
  if (location_based_icon !== undefined && subButtonIcon[1].icon !== location_based_icon) {
    subButtonIcon[1].setAttribute("icon", location_based_icon);
  }
`
  );

  // Add room icon
  // TODO: only do do this is we have a ble_area_sensor
  // TODO: just make a PR to make the icon a part of the entity https://github.com/agittins/bermuda/issues/513
  // TODO: show last updated if its not updated in the last 5 minutes and the normal area sensor is unknown
  if (ble_idx !== undefined) {
    styles += helpers.wrapInBubbleCardStyleIIFE(
      `
      let ble_area_id = hass.states['${ble_area_sensor.entity_id}'].attributes.area_id;
      if (!ble_area_id) { ble_area_id = hass.states['${ble_area_sensor.entity_id}'].state.toLowerCase().replace(/ /g, "_")}
      
      if (ble_area_id) {
        hass.callWS({ type: "config/area_registry/list" }).then((areas) => {
          const ble_area = areas.find((area) => area.area_id === ble_area_id);
          if (ble_area && ble_area.icon) {
            this.config.sub_button[${ble_idx}].icon = ble_area.icon;
          }
        });
      }
      `
    );
  }

  return {
    type: "custom:bubble-card",
    card_type: "separator",
    card_layout: "large",
    icon: person.attributes.entity_picture,
    styles,
    sub_button,
    name: person.attributes.friendly_name,
    grid_options: {
      columns: "full",
      rows: 0.6,
    },
  };
}

function phoneCard(person, entities) {
  // TODO: be smarter about what device tracker we consider their phone
  // For now we just assume it exists and that its the first device tracker listed
  // We should instead parse them all, looking for one that is from the right platform/integration
  // Then maybe return multiple cards for all phones we find
  const phone_entity_id = person.attributes.device_trackers[0];

  // TODO: Make all the subbuttons first test that the entity exists
  // When we do, we must also account for that in the styles
  const phone_sensor_prefix = phone_entity_id.split(".")[1];

  // TODO: Make all the subbuttons first test that the entity exists
  const bluetooth_connection_sensor = `sensor.${phone_sensor_prefix}_bluetooth_connection`;
  const phone_state_sensor = `sensor.${phone_sensor_prefix}_phone_state`;
  const ringer_mode_sensor = `sensor.${phone_sensor_prefix}_ringer_mode`;
  const volume_level_ringer_sensor = `sensor.${phone_sensor_prefix}_volume_level_ringer`;
  const sleep_confidence_sensor = `sensor.${phone_sensor_prefix}_sleep_confidence`;
  const remaining_charge_time_sensor = `sensor.${phone_sensor_prefix}_remaining_charge_time`;
  const alarm_sensor = `sensor.${phone_sensor_prefix}_next_alarm`;
  const steps_sensor = `sensor.${phone_sensor_prefix}_daily_steps`;
  const ble_sensor = `sensor.${phone_sensor_prefix}_ble_transmitter`;

  // Config vars
  const sleep_confidence_visible_threshold = 80; // 90 = visible if sleep confidence is at least 90%
  const sleep_confidence_color = "var(--purple-color)"; // Color of the sleep confidence icon

  // Subbuttons
  const sub_button = [];

  // Helpers
  const isValidEntity = (entity) => {
    if (!entity) return false;
    const ent = entities[entity];
    return (
      ent &&
      (ent.disabled_by === undefined ||
        ent.disabled_by === null ||
        ent.disabled_by === "")
    );
  };

  const phoneSensorEntityID = (domain, key) =>
    `${domain}.${phone_sensor_prefix}_${key}`;

  const COMMON = {
    show_background: true,
    state_background: false,
    show_icon: true,
    show_state: false,
    show_attribute: false,
    show_name: false,
  };

  const addSubButton = (config) => {
    if (!isValidEntity(config.entity)) return null;
    sub_button.push(config);
    return sub_button.length - 1;
  };

  // Sleep Confidence
  const SLEEP_CONFIDENCE_IDX = addSubButton({
    ...COMMON,
    entity: sleep_confidence_sensor,
    name: "Sleep Confidence",
    visibility: [
      {
        condition: "numeric_state",
        entity: sleep_confidence_sensor,
        above: sleep_confidence_visible_threshold - 1,
      },
    ],
  });

  // Interactive
  const INTERACTIVE_IDX = addSubButton({
    ...COMMON,
    entity: phoneSensorEntityID("binary_sensor", "interactive"),
    name: "Interactive",
    visibility: [
      {
        condition: "state",
        entity: phoneSensorEntityID("binary_sensor", "interactive"),
        state_not: "off",
      },
    ],
  });

  // Do Not Disturb
  const DND_IDX = addSubButton({
    ...COMMON,
    entity: phoneSensorEntityID("sensor", "do_not_disturb_sensor"),
    name: "Do Not Disturb",
    visibility: [
      {
        condition: "state",
        entity: phoneSensorEntityID("sensor", "do_not_disturb_sensor"),
        state_not: "off",
      },
    ],
    show_last_changed: false,
  });

  // Ringer Mode
  const RINGER_MODE_IDX = addSubButton({
    ...COMMON,
    entity: phoneSensorEntityID("sensor", "ringer_mode"),
    name: "Ringer Mode",
    attribute: "options",
  });

  // Phone State
  const PHONE_STATE_IDX = addSubButton({
    ...COMMON,
    entity: phoneSensorEntityID("sensor", "phone_state"),
    name: "Phone State",
    state_background: false, // override
    visibility: [
      {
        condition: "state",
        entity: phoneSensorEntityID("sensor", "phone_state"),
        state_not: "idle",
      },
    ],
  });

  // Android Auto
  const ANDROID_AUTO_IDX = addSubButton({
    ...COMMON,
    entity: phoneSensorEntityID("binary_sensor", "android_auto"),
    name: "Android Auto",
    visibility: [
      {
        condition: "state",
        entity: phoneSensorEntityID("binary_sensor", "android_auto"),
        state_not: "off",
      },
    ],
  });

  // Bluetooth State
  const BT_IDX = addSubButton({
    ...COMMON,
    entity: phoneSensorEntityID("binary_sensor", "bluetooth_state"),
    name: "Bluetooth State",
  });

  // BLE (optional)
  const BLE_IDX = addSubButton({
    ...COMMON,
    entity: ble_sensor,
    name: "BLE",
    show_name: true,
    visibility: [
      helpers.visibilityNotUnknownUnavailable(ble_sensor),
      {
        condition: "state",
        entity: ble_sensor,
        state: "Transmitting",
      },
    ],
  });

  // Battery Level
  const BATTERY_IDX = addSubButton({
    ...COMMON,
    entity: phoneSensorEntityID("sensor", "battery_level"),
    name: "Battery Level",
    show_state: true,
  });

  // Remaining Charge Time (optional)
  const CHARGE_TIME_IDX = addSubButton({
    ...COMMON,
    entity: remaining_charge_time_sensor,
    name: "Remaining Charge Time",
    show_state: true,
    visibility: [
      helpers.visibilityNotUnknownUnavailable(remaining_charge_time_sensor),
      {
        condition: "state",
        entity: remaining_charge_time_sensor,
        state_not: "0",
      },
    ],
  });

  // Next Alarm (optional)
  const NEXT_ALARM_IDX = addSubButton(
    {
      ...COMMON,
      entity: alarm_sensor,
      name: "Next Alarm",
      show_name: true,
      visibility: [helpers.visibilityNotUnknownUnavailable(alarm_sensor)],
    },
    { requireEntity: true }
  );

  // Next Alarm (Hours) — keeping your duplicate intentionally for separate usage later
  const NEXT_ALARM_HOURS_IDX = addSubButton({
    ...COMMON,
    entity: alarm_sensor,
    name: "Next Alarm",
    show_name: true,
    visibility: [helpers.visibilityNotUnknownUnavailable(alarm_sensor)],
  });

  // sub_button.push({
  //   entity: alarm_sensor,
  //   name: "Next Alarm",
  //   show_background,
  //   state_background,
  //   show_icon: true,
  //   show_state: false,
  //   show_name: false,
  //   show_attribute: true,
  //   attribute: "Package",
  //   visibility: [helpers.visibilityNotUnknownUnavailable(alarm_sensor)],
  // });
  // const NEXT_ALARM_PKG_IDX = sub_button.length - 1;

  // Add steps sensor
  const STEPS_IDX = addSubButton({
    ...COMMON,
    entity: steps_sensor,
    name: "Daily Steps",
    show_name: false,
  });

  // Get everything that is "labelled" with the person. I link to consider this as "tagging".
  // This allows us to display entities that aren't directly linked to the person / tracker
  // Helper to check if an entity is labelled with the person
  const personLabel = person.entity_id.split(".")[1];

  const isLabelledWithPerson = (ent) => ent?.labels?.includes(personLabel);

  // Collect all entities that are labelled with this person
  const labelled = Object.values(entities).filter(isLabelledWithPerson);

  // Add sub-buttons for each labelled entity
  labelled.forEach((ent) => {
    addSubButton({
      ...COMMON,
      entity: ent.entity_id,
      name: ent.attributes?.friendly_name ?? ent.entity_id,
      show_state: true, // override the COMMON default
    });
  });

  // How much space to put between each subbutton
  const GAP = "4px";

  // Create the styling
  let styles = "";

  // Move the subbuttons up a little so theres not as much space
  styles += `
    /* Move the subbuttons up a little so theres not as much space */
    .bubble-wrapper {
       height: 75%
    }`;

  // Make the Alarm subbutton take up full width
  // styles += `.bubble-sub-button-${NEXT_ALARM_IDX + 1} { flex-basis: 70%; }`;
  // styles += `.bubble-sub-button-${
  //   NEXT_ALARM_HOURS_IDX + 1
  // } { flex-basis: 25%; }`;

  // Allow subbuttons to take up full width. I think? Can't remember why I did this but pretty sure its important. TODO: add proper documentation here.
  // styles += `.card-content {width: 100%; margin: 0 !important;}\n`;

  // Hide the separator line
  // styles += `.bubble-line { opacity: 0; }\n`;

  // Color the sleep confidence icon
  styles += `.bubble-sub-button-${
    SLEEP_CONFIDENCE_IDX + 1
  } {color: ${sleep_confidence_color}}\n`;

  // Color the interactive icon
  styles += `.bubble-sub-button-${
    INTERACTIVE_IDX + 1
  } {color: var(--state-active-color)}\n`;
  // styles += `.bubble-sub-button-2 {\n  /* Do not disturb */\n    color: var(--error-color) !important;\n}\n`;

  // Add a class so we can break the flex-flow rows
  styles += `.break {
    flex-basis: 100%;
    height: 0; 
    margin-top: -${GAP}; /* Cancels out one extra gap */
    }\n`;

  // Change bluetooth icon to reflect connection state
  styles += helpers.wrapInBubbleCardStyleIIFE(`
      if (hass.states['${bluetooth_connection_sensor}'].state > 0) {
        if (this.config.sub_button[${BT_IDX}].icon !== 'mdi:bluetooth-connect') {
          this.config.sub_button[${BT_IDX}].icon = 'mdi:bluetooth-connect';
        }
    } else { delete this.config.sub_button[${BT_IDX}].icon }
      `);

  // Update the Ringer Volume Level to a Percentage
  styles += helpers.wrapInBubbleCardStyleIIFE(`
    // Update Phone Ringer Volume to a percentage
    const target = card.querySelector('.bubble-sub-button-${
      PHONE_STATE_IDX + 1
    } .bubble-sub-button-name-container');
    if (hass.states['${ringer_mode_sensor}'].state === 'normal') {
      const maxRingerVolume = 16
      const ringerVolume = hass.states['${volume_level_ringer_sensor}'].state;
      const volumePercentage = Math.round((ringerVolume / maxRingerVolume) * 100);
      target.innerText = \`\${volumePercentage}%\`;
    } 
    else { target.innerText = '' }`);

  // Update the Ringer Mode Icon
  styles += helpers.wrapInBubbleCardStyleIIFE(`
      const phoneState = hass.states['${phone_state_sensor}']?.state;  
      if (phoneState === 'idle') {
          this.config.sub_button[${PHONE_STATE_IDX}].icon = "mdi:phone-hangup";
      }
      else if (phoneState === 'ringing') {
          this.config.sub_button[${PHONE_STATE_IDX}].icon = "mdi:phone-ring";
      }
      else if (phoneState === 'offhook') {
          this.config.sub_button[${PHONE_STATE_IDX}].icon = "mdi:phone-in-talk";
      }  
      else  {
          delete this.config.sub_button[${PHONE_STATE_IDX}].icon;
      }
      `);

  // Format the Next Alarm time
  styles += helpers.wrapInBubbleCardStyleIIFE(`
    const alarmEntity = hass.states['${alarm_sensor}'];
    const alarmTimeMs = alarmEntity?.attributes?.['Time in Milliseconds'];
    if (alarmTimeMs === undefined) { return; }
    ${getOrdinalSuffix.toString()}
    ${formatEpoch.toString()}
    const alarm_formatted_data = ${formatEpoch.name}(alarmTimeMs)
    this.config.sub_button[${NEXT_ALARM_IDX}].name=alarm_formatted_data.date;
    this.config.sub_button[${NEXT_ALARM_HOURS_IDX}].name=alarm_formatted_data.hours;

    const alarmPkg = alarmEntity.attributes.Package.split('.').at(-1).toLowerCase().replace(/package$/, "")

    if (alarmPkg.startsWith("clock") || alarmPkg.endsWith("clock")){}
    else {
      this.config.sub_button[${NEXT_ALARM_IDX}].name += ' | ' + alarmPkg.charAt(0).toUpperCase() + alarmPkg.slice(1);
    }`);

  // Add a breaks before the next alarm subbutton
  styles += helpers.wrapInBubbleCardStyleIIFE(`
    const container = card.querySelector(".bubble-sub-button-container");
    if (!container) return;

    const targetElement = container.querySelector('.bubble-sub-button-${
      NEXT_ALARM_IDX + 1
    }');
    if (!targetElement) return;

    // Check if a break element already exists before the target
    if (targetElement.previousElementSibling?.classList.contains("break")) return;

    // Create the break element
    const breakEl = document.createElement("div");
    breakEl.classList.add("break");

    // Insert before the target element
    container.insertBefore(breakEl, targetElement);
  `);

  // Add a breaks before the steps subbutton
  styles += helpers.wrapInBubbleCardStyleIIFE(`
    const container = card.querySelector(".bubble-sub-button-container");
    if (!container) return;

    const targetElement = container.querySelector('.bubble-sub-button-${
      STEPS_IDX + 1
    }');
    if (!targetElement) return;

    // Check if a break element already exists before the target
    if (targetElement.previousElementSibling?.classList.contains("break")) return;

    // Create the break element
    const breakEl = document.createElement("div");
    breakEl.classList.add("break");

    // Insert before the target element
    container.insertBefore(breakEl, targetElement);
  `);

  return {
    type: "custom:bubble-card",
    card_type: "button",
    button_type: "name",
    show_icon: false,
    show_state: false,
    show_name: false,
    sub_button: sub_button,
    card_layout: "large",
    styles,
    modules: [...helpers.BUBBLE_MODULES, "bubble_chips"],
    grid_options: {
      columns: "full",
      rows: "auto",
    },
    bubble_chips: {
      gap: 3,
      "justify-content": "flex-right",
    },
  };
}

function alarmCard(person) {
  // TODO: be smarter about what device tracker we consider their phone
  // For now we just assume it exists and that its the first device tracker listed
  // We should instead parse them all, looking for one that is from the right platform/integration
  // Then maybe return multiple cards for all phones we find
  const phone_entity_id = person.attributes.device_trackers[0];

  // TODO: Make all the subbuttons first test that the entity exists
  // When we do, we must also account for that in the styles
  const phone_sensor_prefix = phone_entity_id.split(".")[1];

  // Create a really long string that will induce scrolling
  const SCROLLING_TEXT_TO_REPLACE = "SCROLLING";

  const styles =
    `
    .bubble-name-container {
    margin-right: 0px !important;
  }
    ` +
    helpers.wrapInBubbleCardStyleIIFE(`
    function capitalizeFirst(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Extract the package that set the alarm
    const packageElement = card.querySelector('.bubble-state');
    packageElement.textContent = packageElement.textContent.split('.').at(-1) // Get the last part of the package as thats typically the useful part
    if (packageElement.textContent.startsWith("clock") || packageElement.textContent.endsWith("clock")) {
      // If its just the clock, then blank it out because we can reasonably assume that
      packageElement.textContent = "";
    }
    // If we didn't blank it then make it capitalized
    packageElement.textContent = capitalizeFirst(packageElement.textContent);


    const alarmEntity = hass.states['sensor.${phone_sensor_prefix}_next_alarm'];
    const alarmTimeMs = alarmEntity?.attributes?.['Time in Milliseconds'];

    if (alarmTimeMs) {
      const alarmDate = new Date(alarmTimeMs); // Convert milliseconds to Date object

      try {
        // Format as a time string using toLocaleTimeString
        const formattedTime = alarmDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });

        //const bubbleNameContainer = card.querySelector('.bubble-name.name .scrolling-container span');
        const bubbleNameContainer = card.querySelector('.bubble-name.name');
        if (bubbleNameContainer) {
          // const bubbleNameContainerInnerHTML = bubbleNameContainer.innerHTML.replace(/${SCROLLING_TEXT_TO_REPLACE}/g, formattedTime);
          // if (bubbleNameContainer.innerHTML !== bubbleNameContainerInnerHTML) { bubbleNameContainer.innerHTML = bubbleNameContainerInnerHTML }
          bubbleNameContainer.textContent = formattedTime;
        }

        // const bubbleNameContainer = card.querySelector('.bubble-name-container');
        // bubbleNameContainer.innerText = formattedTime;

      } catch (error) { console.error("Error shortening alarm time:", error)}

      try {
        const timeETAElement = card.querySelector('.bubble-sub-button-1 .bubble-sub-button-name-container');

        if (timeETAElement && alarmTimeMs) {
          const currentDate = new Date();

          // Calculate the difference in hours
          const timeDiffMs = alarmDate - currentDate; // Difference in milliseconds
          const hoursLeft = Math.max((timeDiffMs / (1000 * 60 * 60)), 0); // Convert ms to hours with decimals
          const formattedHoursLeft = hoursLeft.toFixed(1) % 1 === 0 ? hoursLeft.toFixed(0) : hoursLeft.toFixed(1);
          const hourLabel = hoursLeft === 1 ? "hour" : "hours";

          // Make a newline if the screen is too narrow. Otherwise just a space.
          const hoursPrefixSeparator = window.innerWidth <= 900 ? '\\n' : ' ';

          // Display the date, time, and "in X hours" message
          // timeETAElement.innerText = \`In about\${hoursPrefixSeparator}\${formattedHoursLeft} \${hourLabel}\`;
          timeETAElement.innerText = \`\${formattedHoursLeft} \${hourLabel}\`;
          //timeETAElement.classList.add('center-content'); // Add centering class

        } else if (timeETAElement) {
          timeETAElement.innerText = "No alarm set";
        }
      } catch (error) {
        console.error("Error updating alarm time:", error);
      }
  }
  `);

  return {
    type: "custom:bubble-card",
    card_type: "button",
    button_type: "state",
    entity: `sensor.${phone_sensor_prefix}_next_alarm`,
    show_name: true,
    name: SCROLLING_TEXT_TO_REPLACE,
    show_attribute: true,
    attribute: "Package",
    show_last_changed: false,
    scrolling_effect: false,
    show_state: false,
    sub_button: [
      {
        name: "In X Time",
        entity: `sensor.${phone_sensor_prefix}_next_alarm`,
        show_name: false,
        show_state: true,
        show_last_changed: false,
        show_attribute: false,
        state_background: false,
        show_background: false,
        show_icon: false,
      },
    ],
    card_layout: "large",
    visibility: [
      helpers.visibilityNotUnknownUnavailable(
        `sensor.${phone_sensor_prefix}_next_alarm`
      ),
    ],
    styles,
    columns: 2.25,
  };
}

function alarmCard2(person) {
  // TODO: be smarter about what device tracker we consider their phone
  // For now we just assume it exists and that its the first device tracker listed
  // We should instead parse them all, looking for one that is from the right platform/integration
  // Then maybe return multiple cards for all phones we find
  const phone_entity_id = person.attributes.device_trackers[0];

  // TODO: Make all the subbuttons first test that the entity exists
  // When we do, we must also account for that in the styles
  const phone_sensor_prefix = phone_entity_id.split(".")[1];

  const justify_content = "space-between";
  const icon_px = 46;
  const styles =
    `
    .card-content {
      width: 100%;
      margin: 0 !important;
    }
    .bubble-sub-button {
      height: ${icon_px}px !important;
      width: ${icon_px}px !important;
    }

    .bubble-sub-button-container {
      display: flex !important;
      width: 100%;
      justify-content: ${justify_content} !important;
    }

    .bubble-sub-button-icon {
      --mdc-icon-size: inherit !important;
    }

    .bubble-name-container {
      margin-right: 0 !important;
    }
` +
    helpers.wrapInBubbleCardStyleIIFE(`
    function capitalizeFirst(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Extract the package that set the alarm
    const packageElement = card.querySelector('.bubble-state');
    packageElement.textContent = packageElement.textContent.split('.').at(-1) // Get the last part of the package as thats typically the useful part
    if (packageElement.textContent.startsWith("clock") || packageElement.textContent.endsWith("clock")) {
      // If its just the clock, then blank it out because we can reasonably assume that
      packageElement.textContent = "";
    }
    // If we didn't blank it then make it capitalized
    packageElement.textContent = capitalizeFirst(packageElement.textContent);


    const alarmEntity = hass.states['sensor.${phone_sensor_prefix}_next_alarm'];
    const alarmTimeMs = alarmEntity?.attributes?.['Time in Milliseconds'];

    if (alarmTimeMs) {
      const alarmDate = new Date(alarmTimeMs); // Convert milliseconds to Date object

      try {
        // Format as a time string using toLocaleTimeString
        const formattedTime = alarmDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });

      } catch (error) { console.error("Error shortening alarm time:", error)}

      try {
        const timeETAElement = card.querySelector('.bubble-sub-button-1 .bubble-sub-button-name-container');

        if (timeETAElement && alarmTimeMs) {
          const currentDate = new Date();

          // Calculate the difference in hours
          const timeDiffMs = alarmDate - currentDate; // Difference in milliseconds
          const hoursLeft = Math.max((timeDiffMs / (1000 * 60 * 60)), 0); // Convert ms to hours with decimals
          const formattedHoursLeft = hoursLeft.toFixed(1) % 1 === 0 ? hoursLeft.toFixed(0) : hoursLeft.toFixed(1);
          const hourLabel = hoursLeft === 1 ? "hour" : "hours";

          // Make a newline if the screen is too narrow. Otherwise just a space.
          const hoursPrefixSeparator = window.innerWidth <= 900 ? '\\n' : ' ';

          // Display the date, time, and "in X hours" message
          // timeETAElement.innerText = \`In about\${hoursPrefixSeparator}\${formattedHoursLeft} \${hourLabel}\`;
          timeETAElement.innerText = \`\${formattedHoursLeft} \${hourLabel}\`;
          //timeETAElement.classList.add('center-content'); // Add centering class

        } else if (timeETAElement) {
          timeETAElement.innerText = "No alarm set";
        }
      } catch (error) {
        console.error("Error updating alarm time:", error);
      }
  }
  `);

  return {
    type: "custom:bubble-card",
    card_type: "separator",
    button_type: "state",
    show_name: false,
    name: "",
    show_attribute: false,
    show_last_changed: false,
    scrolling_effect: false,
    show_state: false,
    sub_button: [
      {
        name: "In X Time",
        entity: `sensor.${phone_sensor_prefix}_next_alarm`,
        show_name: false,
        show_state: true,
        show_last_changed: false,
        show_attribute: false,
        state_background: false,
        show_background: false,
        show_icon: false,
      },
    ],
    card_layout: "large",
    visibility: [
      helpers.visibilityNotUnknownUnavailable(
        `sensor.${phone_sensor_prefix}_next_alarm`
      ),
    ],
    styles,
    grid_options: {
      columns: 2.25,
    },
    modules: helpers.BUBBLE_MODULES,
  };
}

// Functions to help manipulate Alarm Icon via Styles
// We will call the `toString()` method on these functions to get the string to put in the styles
/**
 * Returns the day of month with its ordinal suffix (e.g., 1st, 2nd, 3rd, 4th).
 * @param {number} n - The day of the month.
 * @returns {string} The day with its ordinal suffix.
 */
function getOrdinalSuffix(n) {
  if (n % 100 >= 11 && n % 100 <= 13) {
    return n + "th";
  }
  switch (n % 10) {
    case 1:
      return n + "st";
    case 2:
      return n + "nd";
    case 3:
      return n + "rd";
    default:
      return n + "th";
  }
}

/**
 * Converts an epoch timestamp to a human-friendly format.
 *
 * Returns an object containing:
 * - date: The date information (day of the week, time), e.g., "Today @ 8:30 AM"
 * - hours: The future time difference in decimal hours, e.g., "5.2 hours"
 * - combined: Both pieces separated by " | "
 *
 * If the date is today or tomorrow, it prefixes with "Today @" or "Tomorrow @" respectively.
 * @param {number} epoch - Epoch time in seconds or milliseconds.
 * @returns {object} Object with keys: date, hours, combined.
 */
function formatEpoch(epoch) {
  // Convert to milliseconds if necessary.
  if (epoch.toString().length === 10) {
    epoch *= 1000;
  }
  const alarmDate = new Date(epoch);

  // Get current time and today's/tomorrow's dates.
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );

  // Check if alarmDate is today or tomorrow.
  const isToday =
    alarmDate.getFullYear() === today.getFullYear() &&
    alarmDate.getMonth() === today.getMonth() &&
    alarmDate.getDate() === today.getDate();
  const isTomorrow =
    alarmDate.getFullYear() === tomorrow.getFullYear() &&
    alarmDate.getMonth() === tomorrow.getMonth() &&
    alarmDate.getDate() === tomorrow.getDate();

  // Format time component.
  const formattedTime = alarmDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  // Build date string.
  let dateString;
  if (isToday) {
    dateString = `Today @ ${formattedTime}`;
  } else if (isTomorrow) {
    dateString = `Tomorrow @ ${formattedTime}`;
  } else {
    const weekday = alarmDate.toLocaleDateString("en-US", { weekday: "long" });
    dateString = `${weekday} @ ${formattedTime}`;
  }

  // Calculate how far into the future the alarm is in decimal hours.
  let diffMs = Math.max(0, alarmDate - now);
  const diffHoursDecimal = diffMs / (1000 * 60 * 60);
  // Check if the value is effectively a whole number.
  const isWhole =
    Math.abs(diffHoursDecimal - Math.round(diffHoursDecimal)) < 0.001;
  const hoursStr = isWhole
    ? Math.round(diffHoursDecimal).toString()
    : diffHoursDecimal.toFixed(1);
  const hourLabel = parseFloat(hoursStr) === 1 ? " hour" : " hours";
  const futureString = hoursStr + hourLabel;

  const combined = `${dateString} | ${futureString}`;

  return { date: dateString, hours: futureString, combined };
}

customElements.define("ll-strategy-view-magic-people", PeopleView);
