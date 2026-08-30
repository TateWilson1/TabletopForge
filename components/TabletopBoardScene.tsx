"use client";

import { useEffect, useRef, useState } from "react";
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { boardSpaceCount, pawnOptions, type CyberBoardSpace, type PawnKey, type PawnOption } from "@/components/tabletop-board-config";

export function TabletopBoardScene({
  pawn,
  boardSpaces,
  positionIndex,
  rollNonce,
  rollResult,
  isRolling,
  sceneTitle = "Incident Response",
  sceneSubtitle = "TabletopForge",
  sceneIndustry = "General",
  sceneOrganizationSize = "Team",
}: {
  pawn: PawnKey;
  boardSpaces: CyberBoardSpace[];
  positionIndex: number;
  rollNonce: number;
  rollResult: number;
  isRolling: boolean;
  sceneTitle?: string;
  sceneSubtitle?: string;
  sceneIndustry?: string;
  sceneOrganizationSize?: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const isRollingRef = useRef(isRolling);
  const positionIndexRef = useRef(positionIndex);
  const [sceneError, setSceneError] = useState("");
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    world: CANNON.World;
    diceBody: CANNON.Body;
    diceMesh: THREE.Object3D;
    pawnBody: CANNON.Body;
    pawnGroup: THREE.Group;
    pawnTarget: THREE.Vector3;
    highlightRing: THREE.Mesh;
    pawnSpotlight: THREE.SpotLight;
    spotlightTarget: THREE.Object3D;
    revealCardGroup: THREE.Group;
    revealCardStart: number;
    sparkleField: THREE.Points;
    scenarioSetPiece: THREE.Group;
    tileMeshes: THREE.Mesh[];
    animationId: number;
  } | null>(null);

  useEffect(() => {
    isRollingRef.current = isRolling;
  }, [isRolling]);

  useEffect(() => {
    positionIndexRef.current = positionIndex;
  }, [positionIndex]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    const mountElement = mount;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setSceneError("3D rendering is unavailable on this device or browser.");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.45));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mountElement.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1117);
    scene.fog = new THREE.Fog(0x0b1117, 9.5, 23);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 8.4, 13.4);
    camera.lookAt(0, 0, 0);

    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    world.broadphase = new CANNON.SAPBroadphase(world);

    addLighting(scene);
    addRoom(scene);
    addTable(scene);
    addTabletopDetails(scene);
    addGameBoard(scene, sceneTitle, sceneSubtitle);
    const tileMeshes = addBoardSpaces(scene, boardSpaces);
    addBoardTrackDecorations(scene, boardSpaces);
    addCardDecks(scene);
    addGameTokens(scene);
    const scenarioSetPiece = addScenarioSetPiece(scene, sceneTitle, sceneIndustry);
    addParticipantSeats(scene, sceneOrganizationSize);

    const highlightRing = createHighlightRing();
    highlightRing.position.copy(getBoardPosition(0).setY(0.245));
    scene.add(highlightRing);

    const spotlightTarget = new THREE.Object3D();
    spotlightTarget.position.copy(highlightRing.position);
    scene.add(spotlightTarget);

    const pawnSpotlight = new THREE.SpotLight(0x23d39b, 1.35, 4.2, 0.54, 0.82, 1.2);
    pawnSpotlight.position.set(0, 2.8, 0);
    pawnSpotlight.target = spotlightTarget;
    scene.add(pawnSpotlight);

    const revealCardGroup = createRevealCard();
    revealCardGroup.visible = false;
    scene.add(revealCardGroup);

    const sparkleField = createSparkleField();
    scene.add(sparkleField);

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(4.7, 0.08, 3.6)) });
    groundBody.position.set(0, 0.18, 0);
    world.addBody(groundBody);

    const diceMesh = createD20Mesh();
    diceMesh.position.set(4.06, 0.94, 0.28);
    scene.add(diceMesh);

    const diceBody = new CANNON.Body({ mass: 1.2, shape: new CANNON.Sphere(0.39), linearDamping: 0.32, angularDamping: 0.26 });
    diceBody.position.set(4.06, 0.94, 0.28);
    world.addBody(diceBody);

    const pawnGroup = createPawnMesh(pawnOptions[0]);
    const pawnTarget = getBoardPosition(0).clone().setY(0.5);
    pawnGroup.position.copy(pawnTarget);
    scene.add(pawnGroup);

    const pawnBody = new CANNON.Body({
      mass: 0.9,
      shape: new CANNON.Sphere(0.23),
      linearDamping: 0.66,
      angularDamping: 0.76,
    });
    pawnBody.position.set(pawnTarget.x, pawnTarget.y, pawnTarget.z);
    world.addBody(pawnBody);

    function resize() {
      const width = mountElement.clientWidth;
      const height = mountElement.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mountElement);

    let previousFrameTime = performance.now();
    let cameraIntro = 0;
    const animate = () => {
      const currentState = sceneRef.current;
      if (!currentState) {
        return;
      }

      const now = performance.now();
      const elapsed = now / 1000;
      const delta = Math.min((now - previousFrameTime) / 1000, 0.033);
      previousFrameTime = now;
      const pawnDelta = new CANNON.Vec3(
        pawnTarget.x - pawnBody.position.x,
        0,
        pawnTarget.z - pawnBody.position.z,
      );
      const distanceToTarget = Math.hypot(pawnDelta.x, pawnDelta.z);
      const diceSpeed = Math.hypot(diceBody.velocity.x, diceBody.velocity.y, diceBody.velocity.z);
      const shouldSimulate = isRollingRef.current || distanceToTarget > 0.025 || diceSpeed > 0.04 || cameraIntro < 1;

      if (shouldSimulate) {
        world.step(1 / 60, delta, 2);
        pawnBody.velocity.x = pawnDelta.x * 5.4;
        pawnBody.velocity.z = pawnDelta.z * 5.4;
        if (distanceToTarget > 0.08 && pawnBody.position.y < 0.5) {
          pawnBody.velocity.y = 1.18;
        }
      } else {
        pawnBody.velocity.set(0, 0, 0);
      }

      diceMesh.position.copy(cannonToThree(diceBody.position));
      diceMesh.quaternion.copy(cannonQuatToThree(diceBody.quaternion));
      currentState.pawnGroup.position.copy(cannonToThree(pawnBody.position));
      currentState.pawnGroup.position.y += Math.sin(elapsed * 4.2) * 0.015;
      currentState.pawnGroup.rotation.y += isRollingRef.current ? 0.025 : 0.006;

      currentState.highlightRing.position.lerp(pawnTarget.clone().setY(0.245), 0.14);
      currentState.highlightRing.rotation.z += 0.018;
      currentState.highlightRing.scale.setScalar(1 + Math.sin(elapsed * 5.1) * 0.045);
      currentState.spotlightTarget.position.copy(currentState.highlightRing.position);
      currentState.pawnSpotlight.position.set(
        currentState.highlightRing.position.x,
        2.55 + Math.sin(elapsed * 3) * 0.12,
        currentState.highlightRing.position.z,
      );

      currentState.sparkleField.rotation.y += delta * 0.16;
      currentState.sparkleField.position.y = 0.18 + Math.sin(elapsed * 1.2) * 0.035;
      currentState.scenarioSetPiece.rotation.y += delta * 0.32;
      currentState.scenarioSetPiece.position.y = 0.42 + Math.sin(elapsed * 1.45) * 0.035;

      animateTileMaterials(currentState.tileMeshes, positionIndexRef.current, elapsed);
      animateRevealCard(currentState.revealCardGroup, currentState.revealCardStart, now);

      cameraIntro = Math.min(1, cameraIntro + delta * 0.62);
      const orbit = Math.sin(elapsed * 0.18) * 0.16;
      const cameraTarget = isRollingRef.current
        ? new THREE.Vector3(3.45, 5.1, 6.35)
        : new THREE.Vector3(5.18 + orbit, 6.1, 8.35 - orbit * 0.6);
      const cameraStart = new THREE.Vector3(0, 8.4, 13.4);
      const introTarget = cameraStart.lerp(cameraTarget, easeOutCubic(cameraIntro));
      camera.position.lerp(introTarget, cameraIntro < 1 ? 1 : 0.035);
      camera.lookAt(0, 0.05, 0);

      renderer.render(scene, camera);
      currentState.animationId = window.requestAnimationFrame(animate);
    };

    sceneRef.current = {
      renderer,
      scene,
      camera,
      world,
      diceBody,
      diceMesh,
      pawnBody,
      pawnGroup,
      pawnTarget,
      highlightRing,
      pawnSpotlight,
      spotlightTarget,
      revealCardGroup,
      revealCardStart: 0,
      sparkleField,
      scenarioSetPiece,
      tileMeshes,
      animationId: window.requestAnimationFrame(animate),
    };

    return () => {
      resizeObserver.disconnect();
      if (sceneRef.current) {
        window.cancelAnimationFrame(sceneRef.current.animationId);
      }
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(disposeMaterial);
        }
      });
      mountElement.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [boardSpaces, sceneIndustry, sceneOrganizationSize, sceneSubtitle, sceneTitle]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) {
      return;
    }

    state.scene.remove(state.pawnGroup);
    const pawnOption = pawnOptions.find((option) => option.key === pawn) ?? pawnOptions[0];
    const nextPawn = createPawnMesh(pawnOption);
    nextPawn.position.copy(state.pawnGroup.position);
    state.scene.add(nextPawn);
    state.pawnGroup = nextPawn;
  }, [pawn]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) {
      return;
    }

    state.pawnTarget.copy(getBoardPosition(positionIndex % boardSpaces.length).clone().setY(0.5));
  }, [boardSpaces.length, positionIndex]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state || rollNonce === 0) {
      return;
    }

    const push = 3.2 + (rollResult % 5) * 0.3;
    state.diceBody.position.set(3.72, 1.22, 0.42);
    state.diceBody.velocity.set(-push, 4.15, 1.1 - (rollResult % 3));
    state.diceBody.angularVelocity.set(8.5 + rollResult * 0.34, 7.2, 5.2 + rollResult * 0.16);
    state.diceBody.quaternion.setFromEuler(rollResult * 0.1, rollResult * 0.2, rollResult * 0.3);
    state.revealCardStart = performance.now();
    state.revealCardGroup.visible = true;
  }, [rollNonce, rollResult]);

  if (sceneError) {
    return (
      <div className="flex h-full min-h-[28rem] w-full items-center justify-center p-6 text-center" aria-label="3D tabletop board unavailable">
        <div className="max-w-md rounded-md border border-border bg-background/70 p-5">
          <p className="text-lg font-semibold text-foreground">3D board unavailable</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {sceneError} Switch to Classic Mode to keep running the tabletop.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className="h-full min-h-[28rem] w-full" aria-label="3D tabletop board" />;
}

function getBoardPosition(index: number) {
  const space = getBoardSpace(index);
  return new THREE.Vector3(space.x, 0, space.z);
}

function getBoardSpace(index: number) {
  const positions = [
    { x: -3.18, z: 2.42, side: "top", corner: true },
    { x: -1.9, z: 2.42, side: "top", corner: false },
    { x: -0.64, z: 2.42, side: "top", corner: false },
    { x: 0.64, z: 2.42, side: "top", corner: false },
    { x: 1.9, z: 2.42, side: "top", corner: false },
    { x: 3.18, z: 2.42, side: "top", corner: true },
    { x: 3.18, z: 1.46, side: "right", corner: false },
    { x: 3.18, z: 0.48, side: "right", corner: false },
    { x: 3.18, z: -0.48, side: "right", corner: false },
    { x: 3.18, z: -1.46, side: "right", corner: false },
    { x: 3.18, z: -2.42, side: "bottom", corner: true },
    { x: 1.9, z: -2.42, side: "bottom", corner: false },
    { x: 0.64, z: -2.42, side: "bottom", corner: false },
    { x: -0.64, z: -2.42, side: "bottom", corner: false },
    { x: -1.9, z: -2.42, side: "bottom", corner: false },
    { x: -3.18, z: -2.42, side: "bottom", corner: true },
    { x: -3.18, z: -1.46, side: "left", corner: false },
    { x: -3.18, z: -0.48, side: "left", corner: false },
    { x: -3.18, z: 0.48, side: "left", corner: false },
    { x: -3.18, z: 1.46, side: "left", corner: false },
  ] as const;

  return positions[index % positions.length];
}

function addLighting(scene: THREE.Scene) {
  const ambient = new THREE.HemisphereLight(0xd8fff1, 0x0d1117, 1.35);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff4df, 2.2);
  keyLight.position.set(3.2, 8.4, 5.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 18;
  keyLight.shadow.camera.left = -7;
  keyLight.shadow.camera.right = 7;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  scene.add(keyLight);

  const accentLight = new THREE.PointLight(0x23d39b, 1.9, 8.5);
  accentLight.position.set(-3.8, 2.9, -2.5);
  scene.add(accentLight);

  const warmLight = new THREE.PointLight(0xf5b83d, 1.1, 7.5);
  warmLight.position.set(3.5, 2.7, 2.8);
  scene.add(warmLight);
}

function addRoom(scene: THREE.Scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(19, 15),
    new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.86, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.82;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x101923, roughness: 0.9, metalness: 0.03 });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(19, 7), wallMaterial);
  backWall.position.set(0, 2.15, -7.1);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), wallMaterial);
  leftWall.position.set(-9.4, 2.15, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);

  const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x23d39b, transparent: true, opacity: 0.1 });
  for (let index = 0; index < 12; index += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.018, 2.6, 0.018), gridMaterial);
    line.position.set(-5.6 + index * 1.02, 1.45, -7.08);
    scene.add(line);
  }
  for (let index = 0; index < 5; index += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.018, 0.018), gridMaterial);
    line.position.set(0, 0.52 + index * 0.56, -7.07);
    scene.add(line);
  }
}

function addTable(scene: THREE.Scene) {
  const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4228, roughness: 0.62, metalness: 0.03 });
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.36, 7.55), tableMaterial);
  tableTop.position.y = -0.28;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  scene.add(tableTop);

  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x3f2618, roughness: 0.58, metalness: 0.05 });
  addFlatBar(scene, 0, -0.03, 3.88, 10.1, 0.16, edgeMaterial);
  addFlatBar(scene, 0, -0.03, -3.88, 10.1, 0.16, edgeMaterial);
  addFlatBar(scene, -5.02, -0.03, 0, 0.16, 7.55, edgeMaterial);
  addFlatBar(scene, 5.02, -0.03, 0, 0.16, 7.55, edgeMaterial);
  addTableLegs(scene, tableMaterial);
}

function addTableLegs(scene: THREE.Scene, material: THREE.Material) {
  const legGeometry = new THREE.BoxGeometry(0.38, 1.35, 0.38);
  const legPositions = [
    [-4.45, -1.0, -3.2],
    [4.45, -1.0, -3.2],
    [-4.45, -1.0, 3.2],
    [4.45, -1.0, 3.2],
  ];

  legPositions.forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(legGeometry, material);
    leg.position.set(x, y, z);
    leg.castShadow = true;
    leg.receiveShadow = true;
    scene.add(leg);
  });
}

function addTabletopDetails(scene: THREE.Scene) {
  const grainMaterial = new THREE.MeshBasicMaterial({ color: 0xd49a62, transparent: true, opacity: 0.14 });
  for (let index = 0; index < 12; index += 1) {
    const grain = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 0.018), grainMaterial);
    grain.position.set(0, -0.095, -3.3 + index * 0.6);
    grain.rotation.x = -Math.PI / 2;
    scene.add(grain);
  }

  const notebook = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.055, 0.84),
    new THREE.MeshStandardMaterial({ color: 0xe7dcc4, roughness: 0.76 }),
  );
  notebook.position.set(-4.05, 0.03, -2.6);
  notebook.rotation.y = 0.2;
  notebook.castShadow = true;
  scene.add(notebook);

  const notesLabel = createLabelMesh("Notes", "#28313d", {
    width: 150,
    height: 70,
    fontSize: 24,
    planeWidth: 0.72,
    planeHeight: 0.34,
    fill: "rgba(231,220,196,0.1)",
    stroke: "rgba(40,49,61,0.28)",
  });
  notesLabel.position.set(-4.05, 0.087, -2.6);
  notesLabel.rotation.set(-Math.PI / 2, 0, 0.2);
  scene.add(notesLabel);

  const pen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.9, 12),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.42, metalness: 0.2 }),
  );
  pen.position.set(-3.68, 0.14, -2.34);
  pen.rotation.z = Math.PI / 2;
  pen.rotation.y = -0.36;
  pen.castShadow = true;
  scene.add(pen);

  const coffee = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.19, 0.34, 24),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.48 }),
  );
  coffee.position.set(4.08, 0.065, 2.8);
  coffee.castShadow = true;
  scene.add(coffee);

  const coffeeTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.012, 24),
    new THREE.MeshBasicMaterial({ color: 0x4a2d1c }),
  );
  coffeeTop.position.set(4.08, 0.245, 2.8);
  scene.add(coffeeTop);

  addLaptop(scene);
  addDiceTray(scene);
}

function addLaptop(scene: THREE.Scene) {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.055, 0.76),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.52, metalness: 0.2 }),
  );
  base.position.set(3.72, 0.02, -2.78);
  base.rotation.y = -0.18;
  base.castShadow = true;
  scene.add(base);

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.055, 0.74),
    new THREE.MeshStandardMaterial({ color: 0x08111f, roughness: 0.3, metalness: 0.18, emissive: 0x113a35, emissiveIntensity: 0.35 }),
  );
  screen.position.set(3.77, 0.36, -3.08);
  screen.rotation.x = -1.08;
  screen.rotation.y = -0.18;
  scene.add(screen);

  const screenLabel = createLabelMesh("SOC", "#23d39b", { width: 130, height: 80, fontSize: 28, planeWidth: 0.55, planeHeight: 0.34, fill: "rgba(5,12,20,0.75)" });
  screenLabel.position.set(3.77, 0.39, -3.08);
  screenLabel.rotation.x = -1.08;
  screenLabel.rotation.y = -0.18;
  scene.add(screenLabel);
}

function addDiceTray(scene: THREE.Scene) {
  const trayMaterial = new THREE.MeshStandardMaterial({ color: 0x27190f, roughness: 0.7, metalness: 0.04 });
  const feltMaterial = new THREE.MeshStandardMaterial({ color: 0x122e24, roughness: 0.9, metalness: 0.02 });
  const trayX = 4.08;
  const trayZ = 0.28;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.08, 1.25), feltMaterial);
  tray.position.set(trayX, 0.02, trayZ);
  tray.castShadow = true;
  scene.add(tray);
  addFlatBar(scene, trayX, 0.11, trayZ + 0.65, 1.72, 0.08, trayMaterial);
  addFlatBar(scene, trayX, 0.11, trayZ - 0.65, 1.72, 0.08, trayMaterial);
  addFlatBar(scene, trayX - 0.88, 0.11, trayZ, 0.08, 1.22, trayMaterial);
  addFlatBar(scene, trayX + 0.88, 0.11, trayZ, 0.08, 1.22, trayMaterial);

  const trayLabel = createLabelMesh("ROLL ZONE", "#fbbf24", {
    width: 180,
    height: 56,
    fontSize: 18,
    planeWidth: 0.72,
    planeHeight: 0.22,
    fill: "rgba(39,25,15,0.74)",
    stroke: "rgba(251,191,36,0.34)",
  });
  trayLabel.position.set(trayX, 0.145, trayZ - 0.02);
  trayLabel.rotation.x = -Math.PI / 2;
  scene.add(trayLabel);
}

function addGameBoard(scene: THREE.Scene, sceneTitle: string, sceneSubtitle: string) {
  const boardShadow = new THREE.Mesh(
    new THREE.BoxGeometry(8.08, 0.08, 6.38),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  boardShadow.position.set(0.1, -0.045, -0.1);
  scene.add(boardShadow);

  const boardTrim = new THREE.Mesh(
    new THREE.BoxGeometry(7.92, 0.12, 6.22),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.58, metalness: 0.14 }),
  );
  boardTrim.position.y = 0.02;
  boardTrim.castShadow = true;
  boardTrim.receiveShadow = true;
  scene.add(boardTrim);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(7.55, 0.14, 5.85),
    new THREE.MeshStandardMaterial({ color: 0x0f2c2b, roughness: 0.78, metalness: 0.06, emissive: 0x031f1b, emissiveIntensity: 0.2 }),
  );
  board.position.y = 0.095;
  board.receiveShadow = true;
  scene.add(board);

  const centerPanel = new THREE.Mesh(
    new THREE.BoxGeometry(4.58, 0.09, 2.92),
    new THREE.MeshStandardMaterial({ color: 0x07131f, roughness: 0.78, metalness: 0.1, emissive: 0x052621, emissiveIntensity: 0.36 }),
  );
  centerPanel.position.y = 0.18;
  centerPanel.castShadow = true;
  centerPanel.receiveShadow = true;
  scene.add(centerPanel);

  const centerGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.38, 2.7),
    new THREE.MeshBasicMaterial({ color: 0x23d39b, transparent: true, opacity: 0.065 }),
  );
  centerGlow.position.y = 0.234;
  centerGlow.rotation.x = -Math.PI / 2;
  scene.add(centerGlow);

  const title = createLabelMesh("TABLETOPFORGE", "#23d39b", { width: 420, height: 90, fontSize: 34, planeWidth: 2.55, planeHeight: 0.5 });
  title.position.set(0, 0.255, -0.54);
  title.rotation.x = -Math.PI / 2;
  scene.add(title);

  const scenarioLabel = createLabelMesh(sceneTitle, "#ffffff", { width: 460, height: 106, fontSize: 26, planeWidth: 2.9, planeHeight: 0.62 });
  scenarioLabel.position.set(0, 0.255, 0.16);
  scenarioLabel.rotation.x = -Math.PI / 2;
  scene.add(scenarioLabel);

  const subtitle = createLabelMesh(sceneSubtitle, "#b8fff0", { width: 460, height: 78, fontSize: 19, planeWidth: 2.9, planeHeight: 0.38 });
  subtitle.position.set(0, 0.255, 0.82);
  subtitle.rotation.x = -Math.PI / 2;
  scene.add(subtitle);
}

function addBoardSpaces(scene: THREE.Scene, boardSpaces: CyberBoardSpace[]) {
  const tileMeshes: THREE.Mesh[] = [];
  for (let index = 0; index < boardSpaceCount; index += 1) {
    const space = getBoardSpace(index);
    const isCorner = space.corner === true;
    const boardSpace = boardSpaces[index];
    const material = new THREE.MeshStandardMaterial({
      color: getSpaceColor(boardSpace.tone, isCorner),
      roughness: 0.56,
      metalness: 0.08,
      emissive: getSpaceColor(boardSpace.tone, isCorner),
      emissiveIntensity: isCorner ? 0.16 : 0.08,
    });
    const isVertical = space.side === "left" || space.side === "right";
    const tileGeometry = new THREE.BoxGeometry(
      isCorner ? 0.98 : isVertical ? 0.58 : 0.88,
      0.12,
      isCorner ? 0.82 : isVertical ? 0.74 : 0.56,
    );
    const tile = new THREE.Mesh(tileGeometry, material);
    tile.position.copy(getBoardPosition(index));
    tile.position.y = 0.205;
    tile.castShadow = true;
    tile.receiveShadow = true;
    scene.add(tile);
    tileMeshes.push(tile);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(tileGeometry),
      new THREE.LineBasicMaterial({ color: isCorner ? 0xd8fff1 : 0x80ffe1, transparent: true, opacity: isCorner ? 0.58 : 0.28 }),
    );
    edges.position.copy(tile.position);
    scene.add(edges);

    const label = createLabelMesh(boardSpace.label, getSpaceTextColor(boardSpace.tone, isCorner), {
      width: 176,
      height: 70,
      fontSize: isCorner ? 20 : 18,
      planeWidth: isVertical ? 0.72 : 0.78,
      planeHeight: 0.3,
    });
    label.position.copy(tile.position);
    label.position.y = 0.276;
    label.rotation.x = -Math.PI / 2;
    if (space.side === "right") {
      label.rotation.z = -Math.PI / 2;
    } else if (space.side === "left") {
      label.rotation.z = Math.PI / 2;
    } else if (space.side === "bottom") {
      label.rotation.z = Math.PI;
    }
    scene.add(label);

    addTileIcon(scene, boardSpace.tone, tile.position, space.side);
  }

  return tileMeshes;
}

function addTileIcon(scene: THREE.Scene, tone: CyberBoardSpace["tone"], position: THREE.Vector3, side: ReturnType<typeof getBoardSpace>["side"]) {
  const iconMaterial = new THREE.MeshStandardMaterial({
    color: getSpaceAccentColor(tone),
    roughness: 0.34,
    metalness: 0.12,
    emissive: getSpaceAccentColor(tone),
    emissiveIntensity: 0.34,
  });
  const geometry =
    tone === "inject"
      ? new THREE.TetrahedronGeometry(0.08)
      : tone === "decision"
        ? new THREE.OctahedronGeometry(0.075)
        : tone === "recovery"
          ? new THREE.TorusGeometry(0.07, 0.014, 8, 18)
          : new THREE.CylinderGeometry(0.06, 0.06, 0.025, 18);
  const icon = new THREE.Mesh(geometry, iconMaterial);
  const offset = side === "top" ? [0, 0.105, -0.24] : side === "bottom" ? [0, 0.105, 0.24] : side === "left" ? [0.22, 0.105, 0] : [-0.22, 0.105, 0];
  icon.position.set(position.x + offset[0], position.y + offset[1], position.z + offset[2]);
  icon.rotation.x = Math.PI / 2;
  icon.castShadow = true;
  scene.add(icon);
}

function addBoardTrackDecorations(scene: THREE.Scene, boardSpaces: CyberBoardSpace[]) {
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.22 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x23d39b, roughness: 0.42, metalness: 0.12, emissive: 0x0a5b48, emissiveIntensity: 0.45 });
  const dimAccentMaterial = new THREE.MeshBasicMaterial({ color: 0x23d39b, transparent: true, opacity: 0.34 });
  const amberMaterial = new THREE.MeshBasicMaterial({ color: 0xf5b83d, transparent: true, opacity: 0.42 });

  addFlatBar(scene, 0, 0.285, 2.94, 7.08, 0.045, railMaterial);
  addFlatBar(scene, 0, 0.285, -2.94, 7.08, 0.045, railMaterial);
  addFlatBar(scene, -3.84, 0.285, 0, 0.045, 5.18, railMaterial);
  addFlatBar(scene, 3.84, 0.285, 0, 0.045, 5.18, railMaterial);

  addFlatBar(scene, 0, 0.305, 1.92, 4.38, 0.03, dimAccentMaterial);
  addFlatBar(scene, 0, 0.305, -1.92, 4.38, 0.03, dimAccentMaterial);
  addFlatBar(scene, -2.48, 0.305, 0, 0.03, 3.26, dimAccentMaterial);
  addFlatBar(scene, 2.48, 0.305, 0, 0.03, 3.26, dimAccentMaterial);

  for (let index = 0; index < boardSpaceCount; index += 1) {
    const space = getBoardSpace(index);
    const boardSpace = boardSpaces[index];
    const pip = new THREE.Mesh(
      new THREE.CylinderGeometry(space.corner ? 0.07 : 0.048, space.corner ? 0.07 : 0.048, 0.03, 16),
      new THREE.MeshStandardMaterial({
        color: getSpaceAccentColor(boardSpace.tone),
        roughness: 0.34,
        metalness: 0.16,
        emissive: getSpaceAccentColor(boardSpace.tone),
        emissiveIntensity: 0.42,
      }),
    );
    pip.rotation.x = Math.PI / 2;
    pip.position.set(...getOuterMarkerPosition(space));
    pip.castShadow = true;
    scene.add(pip);
  }

  const networkNodes = [
    [-2.06, 0.33, -0.94],
    [-0.92, 0.33, 0.82],
    [0.42, 0.33, -0.72],
    [1.82, 0.33, 0.72],
  ];

  networkNodes.forEach(([x, y, z], index) => {
    const node = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.03, 18),
      index % 2 === 0 ? accentMaterial : amberMaterial,
    );
    node.rotation.x = Math.PI / 2;
    node.position.set(x, y, z);
    node.castShadow = true;
    scene.add(node);
  });

  addTrace(scene, -2.06, -0.94, -0.92, 0.82, dimAccentMaterial);
  addTrace(scene, -0.92, 0.82, 0.42, -0.72, amberMaterial);
  addTrace(scene, 0.42, -0.72, 1.82, 0.72, dimAccentMaterial);
  addCornerBadges(scene);
}

function addCornerBadges(scene: THREE.Scene) {
  const badges = [
    { text: "START", x: -3.18, z: 2.42, rotation: 0, color: "#ffffff" },
    { text: "DECIDE", x: 3.18, z: 2.42, rotation: 0, color: "#d8fff1" },
    { text: "IMPACT", x: 3.18, z: -2.42, rotation: Math.PI, color: "#d8fff1" },
    { text: "TWIST", x: -3.18, z: -2.42, rotation: Math.PI, color: "#fbbf24" },
  ];

  badges.forEach((badge) => {
    const label = createLabelMesh(badge.text, badge.color, {
      width: 180,
      height: 54,
      fontSize: 19,
      planeWidth: 0.72,
      planeHeight: 0.23,
      fill: "rgba(6, 12, 20, 0.84)",
    });
    label.position.set(badge.x, 0.335, badge.z);
    label.rotation.set(-Math.PI / 2, 0, badge.rotation);
    scene.add(label);
  });
}

function addCardDecks(scene: THREE.Scene) {
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x13251f, roughness: 0.58, metalness: 0.06, emissive: 0x052b22, emissiveIntensity: 0.18 });
  const injectMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2814, roughness: 0.58, metalness: 0.06, emissive: 0x372108, emissiveIntensity: 0.22 });
  addDeckStack(scene, "Prompt Deck", "#d8fff1", deckMaterial, -1.82, 1.08, 0.22);
  addDeckStack(scene, "Inject Deck", "#fbbf24", injectMaterial, 1.84, -1.08, -0.32);
}

function addDeckStack(scene: THREE.Scene, labelText: string, color: string, material: THREE.Material, x: number, z: number, rotation: number) {
  for (let index = 0; index < 6; index += 1) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.036, 1.2), material);
    card.position.set(x + index * 0.025, 0.29 + index * 0.017, z + index * 0.012);
    card.rotation.y = rotation + index * 0.012;
    card.castShadow = true;
    scene.add(card);
  }

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.012, 0.09),
    new THREE.MeshBasicMaterial({ color: color === "#fbbf24" ? 0xfbbf24 : 0x23d39b, transparent: true, opacity: 0.8 }),
  );
  stripe.position.set(x, 0.42, z - 0.28);
  stripe.rotation.y = rotation;
  scene.add(stripe);

  const label = createLabelMesh(labelText, color, { width: 220, height: 80, fontSize: 22, planeWidth: 0.88, planeHeight: 0.34 });
  label.position.set(x, 0.45, z);
  label.rotation.set(-Math.PI / 2, 0, rotation);
  scene.add(label);
}

function addGameTokens(scene: THREE.Scene) {
  const tokens = [
    { label: "IRP", color: "#23d39b", x: -2.0, z: 0.95 },
    { label: "LOG", color: "#68a8ff", x: -0.72, z: -0.9 },
    { label: "COMMS", color: "#f5b83d", x: 0.82, z: -0.9 },
    { label: "RECOVER", color: "#d98cff", x: 2.05, z: 0.95 },
  ];

  tokens.forEach((token, index) => {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.045, 26),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(token.color),
        roughness: 0.42,
        metalness: 0.18,
        emissive: new THREE.Color(token.color),
        emissiveIntensity: 0.15,
      }),
    );
    base.position.set(token.x, 0.31, token.z);
    base.rotation.x = Math.PI / 2;
    base.castShadow = true;
    scene.add(base);

    const label = createLabelMesh(token.label, "#ffffff", {
      width: 150,
      height: 62,
      fontSize: token.label.length > 4 ? 17 : 22,
      planeWidth: 0.43,
      planeHeight: 0.19,
      fill: "rgba(0,0,0,0.22)",
      stroke: "rgba(255,255,255,0.22)",
    });
    label.position.set(token.x, 0.345, token.z);
    label.rotation.set(-Math.PI / 2, 0, index % 2 === 0 ? 0.18 : -0.18);
    scene.add(label);
  });
}

function addScenarioSetPiece(scene: THREE.Scene, sceneTitle: string, sceneIndustry: string) {
  const scenario = sceneTitle.toLowerCase();
  const accent = getScenarioAccentColor(scenario);
  const pedestalMaterial = new THREE.MeshStandardMaterial({
    color: 0x08221e,
    roughness: 0.55,
    metalness: 0.16,
    emissive: accent,
    emissiveIntensity: 0.12,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.2, depthWrite: false });

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.08, 42), pedestalMaterial);
  pedestal.position.set(0, 0.315, -0.08);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.012, 8, 80), glowMaterial);
  ring.position.set(0, 0.37, -0.08);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  const pulse = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.08, 0.74, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.075, depthWrite: false }),
  );
  pulse.position.set(0, 0.71, -0.08);
  scene.add(pulse);

  const spinner = new THREE.Group();
  spinner.position.set(0, 0.42, -0.08);
  if (scenario.includes("ransom")) {
    addRansomwareSetPiece(spinner, accent);
  } else if (scenario.includes("phishing") || scenario.includes("email")) {
    addPhishingSetPiece(spinner, accent);
  } else if (scenario.includes("exfil")) {
    addDataExfilSetPiece(spinner, accent);
  } else if (scenario.includes("admin")) {
    addAdminSetPiece(spinner, accent);
  } else if (scenario.includes("laptop")) {
    addLaptopSetPiece(spinner, accent);
  } else if (scenario.includes("vendor") || scenario.includes("third")) {
    addVendorSetPiece(spinner, accent);
  } else if (scenario.includes("insider")) {
    addInsiderSetPiece(spinner, accent);
  } else if (scenario.includes("cloud")) {
    addCloudSetPiece(spinner, accent);
  } else {
    addShieldSetPiece(spinner, accent);
  }
  scene.add(spinner);

  const industryLabel = createLabelMesh(sceneIndustry.toUpperCase(), "#b8fff0", {
    width: 220,
    height: 54,
    fontSize: 17,
    planeWidth: 0.9,
    planeHeight: 0.22,
    fill: "rgba(6,12,20,0.66)",
    stroke: "rgba(35,211,155,0.24)",
  });
  industryLabel.position.set(0, 0.338, 1.36);
  industryLabel.rotation.x = -Math.PI / 2;
  scene.add(industryLabel);

  return spinner;
}

function addParticipantSeats(scene: THREE.Scene, sceneOrganizationSize: string) {
  const participantCount = getParticipantCount(sceneOrganizationSize);
  const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.62, metalness: 0.12 });
  const colors = [0x23d39b, 0xf5b83d, 0x68a8ff, 0xd98cff, 0xf97316, 0x5eead4, 0xe5e7eb];
  const spacing = participantCount > 1 ? 5.8 / (participantCount - 1) : 0;

  for (let index = 0; index < participantCount; index += 1) {
    const x = participantCount > 1 ? -2.9 + spacing * index : 0;
    const z = -3.33;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.32), seatMaterial);
    seat.position.set(x, 0.13, z);
    seat.castShadow = true;
    scene.add(seat);

    const tokenMaterial = new THREE.MeshStandardMaterial({
      color: colors[index % colors.length],
      roughness: 0.42,
      metalness: 0.16,
      emissive: colors[index % colors.length],
      emissiveIntensity: 0.12,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.05, 18), tokenMaterial);
    base.position.set(x, 0.2, z + 0.08);
    base.castShadow = true;
    scene.add(base);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), tokenMaterial);
    head.position.set(x, 0.37, z + 0.08);
    head.castShadow = true;
    scene.add(head);
  }
}

function addRansomwareSetPiece(group: THREE.Group, accent: number) {
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

function addPhishingSetPiece(group: THREE.Group, accent: number) {
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

function addDataExfilSetPiece(group: THREE.Group, accent: number) {
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

function addAdminSetPiece(group: THREE.Group, accent: number) {
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

function addLaptopSetPiece(group: THREE.Group, accent: number) {
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

function addVendorSetPiece(group: THREE.Group, accent: number) {
  const material = makeSetPieceMaterial(accent, accent, 0.34);
  for (let index = 0; index < 4; index += 1) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 10, 28), material);
    link.position.set(-0.36 + index * 0.24, 0.3, 0);
    link.rotation.set(Math.PI / 2, index % 2 === 0 ? 0 : Math.PI / 2, 0);
    link.castShadow = true;
    group.add(link);
  }
}

function addInsiderSetPiece(group: THREE.Group, accent: number) {
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

function addCloudSetPiece(group: THREE.Group, accent: number) {
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

function addShieldSetPiece(group: THREE.Group, accent: number) {
  const material = makeSetPieceMaterial(accent, accent, 0.34);
  const shield = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.72, 4), material);
  shield.position.set(0, 0.34, 0);
  shield.rotation.y = Math.PI / 4;
  shield.castShadow = true;
  group.add(shield);
}

function makeSetPieceMaterial(color: number, emissive: number, emissiveIntensity: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.38,
    metalness: 0.16,
    emissive,
    emissiveIntensity,
  });
}

function getScenarioAccentColor(scenario: string) {
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

function getParticipantCount(sceneOrganizationSize: string) {
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

function createHighlightRing() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.025, 10, 42),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95 }),
  );
  ring.rotation.x = Math.PI / 2;
  return ring;
}

function createRevealCard() {
  const group = new THREE.Group();
  const card = new THREE.Mesh(
    new THREE.BoxGeometry(1.32, 0.05, 1.72),
    new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.52, metalness: 0.02 }),
  );
  card.castShadow = true;
  group.add(card);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.012, 1.32),
    new THREE.MeshBasicMaterial({ color: 0x0e2f2b }),
  );
  panel.position.y = 0.035;
  group.add(panel);

  const label = createLabelMesh("DRAW", "#23d39b", { width: 180, height: 80, fontSize: 32, planeWidth: 0.72, planeHeight: 0.32 });
  label.position.y = 0.05;
  label.rotation.x = -Math.PI / 2;
  group.add(label);

  group.position.set(0, 0.5, -0.1);
  group.rotation.y = -0.3;
  return group;
}

function createSparkleField() {
  const count = 70;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = -4.1 + Math.random() * 8.2;
    positions[index * 3 + 1] = 0.38 + Math.random() * 1.8;
    positions[index * 3 + 2] = -3.1 + Math.random() * 6.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x80ffe1, size: 0.035, transparent: true, opacity: 0.32, depthWrite: false });
  return new THREE.Points(geometry, material);
}

function createD20Mesh() {
  const group = new THREE.Group();
  const diceGeometry = new THREE.IcosahedronGeometry(0.4, 0);
  const diceMaterial = new THREE.MeshStandardMaterial({ color: 0xf4b83c, roughness: 0.32, metalness: 0.18, emissive: 0x4c2c05, emissiveIntensity: 0.08 });
  const dice = new THREE.Mesh(diceGeometry, diceMaterial);
  dice.castShadow = true;
  group.add(dice);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(diceGeometry),
    new THREE.LineBasicMaterial({ color: 0x56340d, transparent: true, opacity: 0.82 }),
  );
  group.add(edges);

  const mark = createLabelMesh("20", "#3b2507", {
    width: 96,
    height: 96,
    fontSize: 42,
    planeWidth: 0.34,
    planeHeight: 0.34,
    fill: "rgba(244,184,60,0.12)",
    stroke: "rgba(59,37,7,0.22)",
  });
  mark.position.set(0, 0.405, 0);
  mark.rotation.x = -Math.PI / 2;
  group.add(mark);

  return group;
}

function createPawnMesh(pawn: PawnOption) {
  const group = new THREE.Group();
  const mainMaterial = new THREE.MeshStandardMaterial({ color: pawn.color, roughness: 0.34, metalness: 0.2, emissive: pawn.color, emissiveIntensity: 0.12 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: pawn.accent, roughness: 0.44, metalness: 0.12 });
  const brightMaterial = new THREE.MeshBasicMaterial({ color: pawn.color, transparent: true, opacity: 0.42 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.18, 24), accentMaterial);
  base.position.y = 0.05;
  base.castShadow = true;
  group.add(base);

  const body =
    pawn.key === "spark"
      ? new THREE.Mesh(new THREE.SphereGeometry(0.27, 22, 16), mainMaterial)
      : pawn.key === "anchor"
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 22), mainMaterial)
        : pawn.key === "prism"
          ? new THREE.Mesh(new THREE.OctahedronGeometry(0.34), mainMaterial)
          : new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.58, 22), mainMaterial);
  body.position.y = 0.4;
  body.castShadow = true;
  group.add(body);

  const badge = new THREE.Mesh(
    pawn.key === "spark" ? new THREE.TetrahedronGeometry(0.08) : new THREE.SphereGeometry(0.07, 14, 10),
    brightMaterial,
  );
  badge.position.set(0, 0.72, 0);
  group.add(badge);

  const glow = new THREE.PointLight(pawn.color, 0.82, 1.8);
  glow.position.set(0, 0.72, 0);
  group.add(glow);

  return group;
}

function addFlatBar(scene: THREE.Scene, x: number, y: number, z: number, width: number, depth: number, material: THREE.Material) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.03, depth), material);
  bar.position.set(x, y, z);
  bar.castShadow = true;
  bar.receiveShadow = true;
  scene.add(bar);
}

function addTrace(scene: THREE.Scene, startX: number, startZ: number, endX: number, endZ: number, material: THREE.Material) {
  const length = Math.hypot(endX - startX, endZ - startZ);
  const trace = new THREE.Mesh(new THREE.BoxGeometry(length, 0.018, 0.03), material);
  trace.position.set((startX + endX) / 2, 0.32, (startZ + endZ) / 2);
  trace.rotation.y = -Math.atan2(endZ - startZ, endX - startX);
  scene.add(trace);
}

function getOuterMarkerPosition(space: ReturnType<typeof getBoardSpace>): [number, number, number] {
  if (space.side === "top") {
    return [space.x, 0.34, space.z + 0.46];
  }

  if (space.side === "bottom") {
    return [space.x, 0.34, space.z - 0.46];
  }

  if (space.side === "left") {
    return [space.x - 0.44, 0.34, space.z];
  }

  return [space.x + 0.44, 0.34, space.z];
}

function getSpaceColor(tone: CyberBoardSpace["tone"], isCorner: boolean) {
  if (tone === "inject") {
    return 0x9a3412;
  }

  if (isCorner || tone === "start") {
    return 0x0f766e;
  }

  const colors: Record<CyberBoardSpace["tone"], number> = {
    start: 0x0f766e,
    triage: 0x2563eb,
    decision: 0x6d28d9,
    technical: 0x1e3a8a,
    business: 0x475569,
    recovery: 0x15803d,
    gap: 0x92400e,
    inject: 0x9a3412,
  };

  return colors[tone];
}

function getSpaceAccentColor(tone: CyberBoardSpace["tone"]) {
  const colors: Record<CyberBoardSpace["tone"], number> = {
    start: 0x5eead4,
    triage: 0x93c5fd,
    decision: 0xc4b5fd,
    technical: 0x60a5fa,
    business: 0xcbd5e1,
    recovery: 0x86efac,
    gap: 0xfbbf24,
    inject: 0xfb923c,
  };

  return colors[tone];
}

function getSpaceTextColor(tone: CyberBoardSpace["tone"], isCorner: boolean) {
  if (tone === "inject" || tone === "gap") {
    return "#fff2b8";
  }

  if (isCorner || tone === "start") {
    return "#ffffff";
  }

  return "#d8fff1";
}

function animateTileMaterials(tileMeshes: THREE.Mesh[], positionIndex: number, elapsed: number) {
  tileMeshes.forEach((tile, index) => {
    const material = tile.material instanceof THREE.MeshStandardMaterial ? tile.material : null;
    if (!material) {
      return;
    }

    const isActive = index === positionIndex % tileMeshes.length;
    material.emissiveIntensity = isActive ? 0.42 + Math.sin(elapsed * 6) * 0.12 : 0.08;
    tile.position.y = isActive ? 0.22 + Math.sin(elapsed * 5.4) * 0.018 : 0.205;
  });
}

function animateRevealCard(group: THREE.Group, startTime: number, now: number) {
  if (!startTime) {
    return;
  }

  const age = (now - startTime) / 1000;
  if (age > 1.4) {
    group.visible = false;
    return;
  }

  const lift = Math.sin(Math.min(1, age / 1.4) * Math.PI);
  group.visible = true;
  group.position.set(0, 0.46 + lift * 0.88, -0.1);
  group.rotation.set(-0.1 + lift * 0.24, -0.5 + age * 2.2, 0.05 * Math.sin(age * 12));
  group.scale.setScalar(0.86 + lift * 0.16);
}

function createLabelMesh(
  text: string,
  color: string,
  options?: {
    width?: number;
    height?: number;
    fontSize?: number;
    planeWidth?: number;
    planeHeight?: number;
    fill?: string;
    stroke?: string;
  },
) {
  const canvas = document.createElement("canvas");
  canvas.width = options?.width ?? 192;
  canvas.height = options?.height ?? 72;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = options?.fill ?? "rgba(6, 12, 20, 0.78)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = options?.stroke ?? "rgba(35, 211, 155, 0.52)";
    context.lineWidth = 4;
    context.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    context.fillStyle = color;
    context.font = `bold ${options?.fontSize ?? 22}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    drawWrappedText(context, text, canvas.width / 2, canvas.height / 2, canvas.width - 28, options?.fontSize ?? 22);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  return new THREE.Mesh(
    new THREE.PlaneGeometry(options?.planeWidth ?? (options?.width ? 1.18 : 0.92), options?.planeHeight ?? (options?.height ? 0.36 : 0.34)),
    material,
  );
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, fontSize: number) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      return;
    }
    line = candidate;
  });

  if (line) {
    lines.push(line);
  }

  const displayLines = lines.slice(0, 3);
  if (lines.length > 3) {
    displayLines[2] = `${displayLines[2].replace(/[,.!?;:]+$/, "")}.`;
  }
  const lineHeight = fontSize * 1.15;
  const startY = y - ((displayLines.length - 1) * lineHeight) / 2;
  displayLines.forEach((currentLine, index) => {
    context.fillText(currentLine, x, startY + index * lineHeight);
  });
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function cannonToThree(value: CANNON.Vec3) {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function cannonQuatToThree(value: CANNON.Quaternion) {
  return new THREE.Quaternion(value.x, value.y, value.z, value.w);
}

function disposeMaterial(material: THREE.Material) {
  const mapped = material as THREE.Material & { map?: THREE.Texture | null };
  mapped.map?.dispose();
  material.dispose();
}
