import * as THREE from "three";

// Scenario centerpiece models that float above the middle of the board.

export function addRansomwareSetPiece(group: THREE.Group, accent: number) {
  const fileMaterial = makeSetPieceMaterial(0x102e42, accent, 0.28);
  const lockMaterial = makeSetPieceMaterial(accent, accent, 0.35);
  [-0.24, 0.05, 0.28].forEach((x, index) => {
    const file = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.34 + index * 0.04, 0.055), fileMaterial);
    file.position.set(x, 0.22, -0.02 + index * 0.04);
    file.rotation.y = -0.22 + index * 0.16;
    file.castShadow = true;
    group.add(file);
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.33, 0.2), lockMaterial);
  body.position.set(0, 0.23, 0.18);
  body.castShadow = true;
  group.add(body);

  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 10, 28), lockMaterial);
  shackle.position.set(0, 0.47, 0.18);
  shackle.castShadow = true;
  group.add(shackle);
}

export function addPhishingSetPiece(group: THREE.Group, accent: number) {
  const mailMaterial = makeSetPieceMaterial(0xf8fafc, accent, 0.08);
  const lineMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8 });
  const envelope = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.08), mailMaterial);
  envelope.position.set(0, 0.28, 0);
  envelope.castShadow = true;
  group.add(envelope);

  const flap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.08, 3), lineMaterial);
  flap.position.set(0, 0.29, 0.055);
  flap.rotation.z = Math.PI;
  group.add(flap);

  const lure = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 28), makeSetPieceMaterial(accent, accent, 0.38));
  lure.position.set(0.48, 0.38, 0.08);
  lure.rotation.y = Math.PI / 2;
  group.add(lure);
}

export function addDataExfilSetPiece(group: THREE.Group, accent: number) {
  const databaseMaterial = makeSetPieceMaterial(0x1d4ed8, accent, 0.25);
  const streamMaterial = makeSetPieceMaterial(accent, accent, 0.42);
  [-0.08, 0.08, 0.24].forEach((y) => {
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 28), databaseMaterial);
    disk.position.set(-0.28, y + 0.2, 0);
    disk.castShadow = true;
    group.add(disk);
  });

  for (let index = 0; index < 5; index += 1) {
    const packet = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), streamMaterial);
    packet.position.set(-0.02 + index * 0.16, 0.32 + Math.sin(index) * 0.06, 0.02);
    packet.rotation.set(index * 0.3, index * 0.4, index * 0.2);
    group.add(packet);
  }

  const external = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), streamMaterial);
  external.position.set(0.72, 0.34, 0.02);
  external.castShadow = true;
  group.add(external);
}

export function addAdminSetPiece(group: THREE.Group, accent: number) {
  const material = makeSetPieceMaterial(accent, accent, 0.36);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 10, 30), material);
  ring.position.set(-0.3, 0.32, 0);
  ring.rotation.y = Math.PI / 2;
  group.add(ring);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 16), material);
  shaft.position.set(0.12, 0.32, 0);
  shaft.rotation.z = Math.PI / 2;
  group.add(shaft);

  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.08), material);
  tooth.position.set(0.48, 0.22, 0);
  group.add(tooth);
}

export function addLaptopSetPiece(group: THREE.Group, accent: number) {
  const darkMaterial = makeSetPieceMaterial(0x111827, accent, 0.12);
  const glowMaterial = makeSetPieceMaterial(accent, accent, 0.35);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.52), darkMaterial);
  base.position.set(0, 0.17, 0.12);
  base.castShadow = true;
  group.add(base);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.48, 0.06), darkMaterial);
  screen.position.set(0, 0.45, -0.12);
  screen.rotation.x = -0.22;
  group.add(screen);

  const warning = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), glowMaterial);
  warning.position.set(0, 0.48, -0.07);
  group.add(warning);
}

export function addVendorSetPiece(group: THREE.Group, accent: number) {
  const material = makeSetPieceMaterial(accent, accent, 0.34);
  for (let index = 0; index < 4; index += 1) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 10, 28), material);
    link.position.set(-0.36 + index * 0.24, 0.3, 0);
    link.rotation.set(Math.PI / 2, index % 2 === 0 ? 0 : Math.PI / 2, 0);
    link.castShadow = true;
    group.add(link);
  }
}

export function addInsiderSetPiece(group: THREE.Group, accent: number) {
  const badgeMaterial = makeSetPieceMaterial(0x1f2937, accent, 0.16);
  const accentMaterial = makeSetPieceMaterial(accent, accent, 0.34);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.7, 0.06), badgeMaterial);
  badge.position.set(0, 0.36, 0);
  badge.castShadow = true;
  group.add(badge);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), accentMaterial);
  head.position.set(0, 0.5, 0.05);
  group.add(head);

  const torso = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 18), accentMaterial);
  torso.position.set(0, 0.27, 0.05);
  group.add(torso);
}

export function addCloudSetPiece(group: THREE.Group, accent: number) {
  const cloudMaterial = makeSetPieceMaterial(0xe0f2fe, accent, 0.2);
  const bucketMaterial = makeSetPieceMaterial(accent, accent, 0.34);
  [
    [-0.18, 0.34, 0],
    [0.04, 0.42, 0.02],
    [0.24, 0.34, 0],
  ].forEach(([x, y, z]) => {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 12), cloudMaterial);
    cloud.position.set(x, y, z);
    group.add(cloud);
  });

  const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.34), bucketMaterial);
  bucket.position.set(0.02, 0.16, 0.04);
  group.add(bucket);
}

export function addShieldSetPiece(group: THREE.Group, accent: number) {
  const material = makeSetPieceMaterial(accent, accent, 0.34);
  const shield = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.72, 4), material);
  shield.position.set(0, 0.34, 0);
  shield.rotation.y = Math.PI / 4;
  shield.castShadow = true;
  group.add(shield);
}

export function makeSetPieceMaterial(color: number, emissive: number, emissiveIntensity: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.38,
    metalness: 0.16,
    emissive,
    emissiveIntensity,
  });
}

export function getScenarioAccentColor(scenario: string) {
  if (scenario.includes("ransom")) {
    return 0xfbbf24;
  }

  if (scenario.includes("phishing") || scenario.includes("email")) {
    return 0x38bdf8;
  }

  if (scenario.includes("exfil")) {
    return 0x22d3ee;
  }

  if (scenario.includes("admin")) {
    return 0xc4b5fd;
  }

  if (scenario.includes("laptop")) {
    return 0x93c5fd;
  }

  if (scenario.includes("vendor") || scenario.includes("third")) {
    return 0xfb923c;
  }

  if (scenario.includes("insider")) {
    return 0xf472b6;
  }

  if (scenario.includes("cloud")) {
    return 0x60a5fa;
  }

  return 0x23d39b;
}

export function getParticipantCount(sceneOrganizationSize: string) {
  if (sceneOrganizationSize.includes("1000")) {
    return 7;
  }

  if (sceneOrganizationSize.includes("501")) {
    return 6;
  }

  if (sceneOrganizationSize.includes("101")) {
    return 5;
  }

  if (sceneOrganizationSize.includes("26")) {
    return 4;
  }

  return 3;
}

export function addScenarioSpinner(group: THREE.Group, scenarioTitle: string, accent: number) {
  const scenario = scenarioTitle.toLowerCase();
  if (scenario.includes("ransom")) {
    addRansomwareSetPiece(group, accent);
  } else if (scenario.includes("phishing") || scenario.includes("email")) {
    addPhishingSetPiece(group, accent);
  } else if (scenario.includes("exfil")) {
    addDataExfilSetPiece(group, accent);
  } else if (scenario.includes("admin")) {
    addAdminSetPiece(group, accent);
  } else if (scenario.includes("laptop")) {
    addLaptopSetPiece(group, accent);
  } else if (scenario.includes("vendor") || scenario.includes("third")) {
    addVendorSetPiece(group, accent);
  } else if (scenario.includes("insider")) {
    addInsiderSetPiece(group, accent);
  } else if (scenario.includes("cloud")) {
    addCloudSetPiece(group, accent);
  } else {
    addShieldSetPiece(group, accent);
  }
}
