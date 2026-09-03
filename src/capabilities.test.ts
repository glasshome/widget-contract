import { describe, expect, test } from "bun:test";
import {
  type CapabilityGrant,
  capabilitiesSchema,
  capabilityGrantSchema,
  describeCapability,
  matchesCapability,
} from "./capabilities";

const lightControl: CapabilityGrant = { domain: "light", access: "control" };
const lightRead: CapabilityGrant = { domain: "light", access: "read" };
const livingLights: CapabilityGrant = {
  domain: "light",
  access: "control",
  entities: ["light.living_*"],
};
const lightOnOffOnly: CapabilityGrant = {
  domain: "light",
  access: "control",
  services: ["turn_on", "turn_off"],
};

describe("matchesCapability — deny by default", () => {
  test("empty grants deny everything", () => {
    expect(
      matchesCapability([], { domain: "light", service: "turn_on", entityIds: ["light.a"] }),
    ).toBe(false);
  });

  test("weather-style caps cannot unlock a door", () => {
    const weatherCaps: CapabilityGrant[] = [{ domain: "weather", access: "read" }];
    expect(
      matchesCapability(weatherCaps, {
        domain: "lock",
        service: "unlock",
        entityIds: ["lock.front_door"],
      }),
    ).toBe(false);
  });

  test("light control cannot disarm the alarm", () => {
    expect(
      matchesCapability([lightControl], {
        domain: "alarm_control_panel",
        service: "alarm_disarm",
        entityIds: ["alarm_control_panel.home"],
      }),
    ).toBe(false);
  });

  test("read access never authorizes a service call", () => {
    expect(
      matchesCapability([lightRead], {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.a"],
      }),
    ).toBe(false);
  });

  test("lock control on one entity does not extend to another lock", () => {
    const caps: CapabilityGrant[] = [
      { domain: "lock", access: "control", entities: ["lock.garage"] },
    ];
    expect(
      matchesCapability(caps, {
        domain: "lock",
        service: "unlock",
        entityIds: ["lock.front_door"],
      }),
    ).toBe(false);
    expect(
      matchesCapability(caps, { domain: "lock", service: "unlock", entityIds: ["lock.garage"] }),
    ).toBe(true);
  });
});

describe("matchesCapability — domain grants", () => {
  test("un-narrowed control grant allows any entity of the domain", () => {
    expect(
      matchesCapability([lightControl], {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.kitchen", "light.bedroom"],
      }),
    ).toBe(true);
  });

  test("entity of another domain sneaking into the target list is denied", () => {
    expect(
      matchesCapability([lightControl], {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.kitchen", "lock.front_door"],
      }),
    ).toBe(false);
  });

  test("ALL targeted entities must match, not just one", () => {
    expect(
      matchesCapability([livingLights], {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.living_room", "light.bedroom"],
      }),
    ).toBe(false);
  });
});

describe("matchesCapability — service narrowing", () => {
  test("service inside the narrowing is allowed", () => {
    expect(
      matchesCapability([lightOnOffOnly], {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.a"],
      }),
    ).toBe(true);
  });

  test("service outside the narrowing is denied", () => {
    expect(
      matchesCapability([lightOnOffOnly], {
        domain: "light",
        service: "set_color",
        entityIds: ["light.a"],
      }),
    ).toBe(false);
  });
});

describe("matchesCapability — entity glob narrowing", () => {
  test("glob matches within the object id", () => {
    expect(
      matchesCapability([livingLights], {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.living_room"],
      }),
    ).toBe(true);
  });

  test("glob does not match outside its prefix", () => {
    expect(
      matchesCapability([livingLights], {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.kitchen"],
      }),
    ).toBe(false);
  });

  test("glob is anchored — no substring matching", () => {
    const caps: CapabilityGrant[] = [
      { domain: "light", access: "control", entities: ["light.living"] },
    ];
    expect(
      matchesCapability(caps, {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.living_room"],
      }),
    ).toBe(false);
  });

  test("dots in patterns are literal, not regex wildcards", () => {
    const caps: CapabilityGrant[] = [{ domain: "light", access: "control", entities: ["light.a"] }];
    expect(
      matchesCapability(caps, { domain: "light", service: "turn_on", entityIds: ["lightxa"] }),
    ).toBe(false);
  });

  test("glob never crosses the domain separator", () => {
    // Pattern "light.*" with an rpc whose entityIds claim domain "light" but
    // contain a second dot — HA entity ids have exactly one dot, but the
    // predicate must not be the thing that assumes it.
    const caps: CapabilityGrant[] = [{ domain: "light", access: "control", entities: ["light.*"] }];
    expect(
      matchesCapability(caps, {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.a.b"],
      }),
    ).toBe(false);
  });
});

describe("matchesCapability — empty target (domain-wide calls)", () => {
  test("allowed only with an un-narrowed grant", () => {
    expect(
      matchesCapability([lightControl], { domain: "light", service: "turn_on", entityIds: [] }),
    ).toBe(true);
  });

  test("denied for an entity-narrowed grant", () => {
    expect(
      matchesCapability([livingLights], { domain: "light", service: "turn_on", entityIds: [] }),
    ).toBe(false);
  });
});

describe("matchesCapability — multiple grants", () => {
  test("any one grant authorizing the full call suffices", () => {
    const caps: CapabilityGrant[] = [lightRead, livingLights, lightOnOffOnly];
    expect(
      matchesCapability(caps, {
        domain: "light",
        service: "set_color",
        entityIds: ["light.living_room"],
      }),
    ).toBe(true);
  });

  test("grants do not combine — narrowings are per-grant", () => {
    // Grant A: only turn_on, any light. Grant B: any service, only living_*.
    // A set_color call on light.kitchen matches neither in full.
    const caps: CapabilityGrant[] = [
      { domain: "light", access: "control", services: ["turn_on"] },
      livingLights,
    ];
    expect(
      matchesCapability(caps, {
        domain: "light",
        service: "set_color",
        entityIds: ["light.kitchen"],
      }),
    ).toBe(false);
  });
});

describe("capability schemas", () => {
  test("rejects wildcard domain", () => {
    expect(capabilityGrantSchema.safeParse({ domain: "*", access: "control" }).success).toBe(false);
  });

  test("rejects empty narrowing arrays", () => {
    expect(
      capabilityGrantSchema.safeParse({ domain: "light", access: "control", entities: [] }).success,
    ).toBe(false);
    expect(
      capabilityGrantSchema.safeParse({ domain: "light", access: "control", services: [] }).success,
    ).toBe(false);
  });

  test("rejects entity patterns without a domain part", () => {
    expect(
      capabilityGrantSchema.safeParse({
        domain: "light",
        access: "control",
        entities: ["*"],
      }).success,
    ).toBe(false);
  });

  test("rejects more than 32 grants", () => {
    const grants = Array.from({ length: 33 }, () => lightControl);
    expect(capabilitiesSchema.safeParse(grants).success).toBe(false);
  });

  test("accepts a realistic declaration", () => {
    const result = capabilitiesSchema.safeParse([
      { domain: "light", access: "control" },
      { domain: "climate", access: "read" },
      { domain: "media_player", access: "control", services: ["media_play", "media_pause"] },
    ]);
    expect(result.success).toBe(true);
  });
});

describe("describeCapability", () => {
  test("control sentence for a known domain", () => {
    expect(describeCapability(lightControl)).toBe("Control your lights");
  });

  test("read sentence", () => {
    expect(describeCapability({ domain: "climate", access: "read" })).toBe("Read your thermostat");
  });

  test("entity narrowing is shown", () => {
    expect(describeCapability(livingLights)).toBe("Control your lights (light.living_*)");
  });

  test("service narrowing is shown in plain words", () => {
    expect(describeCapability(lightOnOffOnly)).toBe(
      "Control your lights — only: turn on, turn off",
    );
  });

  test("unknown domain falls back to readable generic", () => {
    expect(describeCapability({ domain: "lawn_mower", access: "control" })).toBe(
      "Control your lawn mower devices",
    );
  });
});

describe("matchesCapability — integration services (function and target in different domains)", () => {
  // Pulse's published grants: Music Assistant and Sonos own no entities, their
  // services act on the media players granted beside them.
  const pulse: CapabilityGrant[] = [
    { domain: "media_player", access: "control" },
    { domain: "sonos", access: "control" },
    { domain: "music_assistant", access: "control" },
  ];

  test("integration service reaches an entity granted by another grant", () => {
    expect(
      matchesCapability(pulse, {
        domain: "music_assistant",
        service: "get_queue",
        entityIds: ["media_player.speaker_right"],
      }),
    ).toBe(true);
    expect(
      matchesCapability(pulse, {
        domain: "sonos",
        service: "snapshot",
        entityIds: ["media_player.speaker_right"],
      }),
    ).toBe(true);
  });

  test("the integration's own entity-less services still need its un-narrowed grant", () => {
    expect(
      matchesCapability(pulse, {
        domain: "music_assistant",
        service: "get_library",
        entityIds: [],
      }),
    ).toBe(true);
    expect(
      matchesCapability([{ domain: "media_player", access: "control" }], {
        domain: "music_assistant",
        service: "get_library",
        entityIds: [],
      }),
    ).toBe(false);
  });

  test("granting the entity does not grant the integration", () => {
    expect(
      matchesCapability([{ domain: "media_player", access: "control" }], {
        domain: "music_assistant",
        service: "get_queue",
        entityIds: ["media_player.speaker_right"],
      }),
    ).toBe(false);
  });

  test("granting the integration does not grant every entity", () => {
    const caps: CapabilityGrant[] = [
      { domain: "media_player", access: "control", entities: ["media_player.kitchen"] },
      { domain: "music_assistant", access: "control" },
    ];
    expect(
      matchesCapability(caps, {
        domain: "music_assistant",
        service: "get_queue",
        entityIds: ["media_player.kitchen"],
      }),
    ).toBe(true);
    expect(
      matchesCapability(caps, {
        domain: "music_assistant",
        service: "get_queue",
        entityIds: ["media_player.bedroom"],
      }),
    ).toBe(false);
  });

  test("an integration grant cannot borrow an unrelated domain's entities to unlock a door", () => {
    const caps: CapabilityGrant[] = [
      { domain: "lock", access: "control" },
      { domain: "music_assistant", access: "control" },
    ];
    expect(
      matchesCapability(caps, {
        domain: "lock",
        service: "unlock",
        entityIds: ["lock.front_door"],
      }),
    ).toBe(true);
    // The lock grant covers the entity, but nothing grants sonos as a function.
    expect(
      matchesCapability([{ domain: "lock", access: "control" }], {
        domain: "sonos",
        service: "snapshot",
        entityIds: ["lock.front_door"],
      }),
    ).toBe(false);
  });

  test("a read grant on the entity's domain does not cover an integration call", () => {
    const caps: CapabilityGrant[] = [
      { domain: "media_player", access: "read" },
      { domain: "music_assistant", access: "control" },
    ];
    expect(
      matchesCapability(caps, {
        domain: "music_assistant",
        service: "get_queue",
        entityIds: ["media_player.speaker_right"],
      }),
    ).toBe(false);
  });

  test("a service-narrowed grant covers its entities for its own services only", () => {
    const caps: CapabilityGrant[] = [
      { domain: "media_player", access: "control", services: ["media_play"] },
      { domain: "music_assistant", access: "control" },
    ];
    expect(
      matchesCapability(caps, {
        domain: "media_player",
        service: "media_play",
        entityIds: ["media_player.speaker_right"],
      }),
    ).toBe(true);
    expect(
      matchesCapability(caps, {
        domain: "music_assistant",
        service: "get_queue",
        entityIds: ["media_player.speaker_right"],
      }),
    ).toBe(false);
  });

  test("an entity-narrowed integration grant is honored as written, not widened", () => {
    // The narrowed grant answers for living_*; the broad media_player grant
    // must not extend it to the kitchen.
    const caps: CapabilityGrant[] = [
      { domain: "media_player", access: "control" },
      {
        domain: "music_assistant",
        access: "control",
        entities: ["media_player.living_*"],
      },
    ];
    expect(
      matchesCapability(caps, {
        domain: "music_assistant",
        service: "get_queue",
        entityIds: ["media_player.living_room"],
      }),
    ).toBe(true);
    expect(
      matchesCapability(caps, {
        domain: "music_assistant",
        service: "get_queue",
        entityIds: ["media_player.kitchen"],
      }),
    ).toBe(false);
  });
});
