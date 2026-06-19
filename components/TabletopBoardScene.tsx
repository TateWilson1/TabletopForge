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
}: {
  pawn: PawnKey;
  boardSpaces: CyberBoardSpace[];
  positionIndex: number;
  rollNonce: number;
  rollResult: number;
  isRolling: boolean;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const isRollingRef = useRef(isRolling);
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
    animationId: number;
  } | null>(null);

  useEffect(() => {
    isRollingRef.current = isRolling;
  }, [isRolling]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    const mountElement = mount;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setSceneError("3D rendering is unavailable on this device or browser.");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    mountElement.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1117);
    scene.fog = new THREE.Fog(0x0b1117, 8, 20);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 8.4, 13.4);
    camera.lookAt(0, 0, 0);

    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    world.broadphase = new CANNON.SAPBroadphase(world);

    const ambient = new THREE.AmbientLight(0xfff3df, 0.58);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff4df, 1.2);
    keyLight.position.set(2.8, 7.2, 5.4);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x23d39b, 0.9, 9);
    fillLight.position.set(-3.6, 2.6, -2.6);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 14),
      new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.88, metalness: 0.02 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.82;
    scene.add(floor);

    const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4228, roughness: 0.68, metalness: 0.02 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.35, 7.2), tableMaterial);
    table.position.y = -0.28;
    scene.add(table);

    addTableLegs(scene, tableMaterial);
    addTabletopDetails(scene);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(7.55, 0.12, 5.85),
      new THREE.MeshStandardMaterial({ color: 0x0f2c2b, roughness: 0.82, metalness: 0.04 }),
    );
    board.position.y = 0;
    scene.add(board);

    const boardTrim = new THREE.Mesh(
      new THREE.BoxGeometry(7.82, 0.08, 6.12),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.72, metalness: 0.06 }),
    );
    boardTrim.position.y = -0.015;
    scene.add(boardTrim);
    board.position.y = 0.035;

    const centerPanel = new THREE.Mesh(
      new THREE.BoxGeometry(4.55, 0.08, 2.9),
      new THREE.MeshStandardMaterial({ color: 0x07131f, roughness: 0.9, metalness: 0.04 }),
    );
    centerPanel.position.y = 0.12;
    scene.add(centerPanel);

    const centerLabel = createLabelMesh("TabletopForge", "#23d39b", { width: 320, height: 96, fontSize: 28 });
    centerLabel.position.set(0, 0.18, 0);
    centerLabel.rotation.x = -Math.PI / 2;
    scene.add(centerLabel);

    addBoardSpaces(scene, boardSpaces);
    addCardDecks(scene);

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(4.7, 0.08, 3.6)) });
    groundBody.position.set(0, 0.12, 0);
    world.addBody(groundBody);

    const diceMesh = createD20Mesh();
    diceMesh.position.set(0.35, 0.9, 0.55);
    scene.add(diceMesh);

    const diceBody = new CANNON.Body({ mass: 1.2, shape: new CANNON.Sphere(0.38), linearDamping: 0.34, angularDamping: 0.28 });
    diceBody.position.set(0.35, 0.9, 0.55);
    world.addBody(diceBody);

    const pawnGroup = createPawnMesh(pawnOptions[0]);
    const pawnTarget = getBoardPosition(0).clone().setY(0.48);
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
          pawnBody.velocity.y = 1.2;
        }
      } else {
        pawnBody.velocity.set(0, 0, 0);
      }

      diceMesh.position.copy(cannonToThree(diceBody.position));
      diceMesh.quaternion.copy(cannonQuatToThree(diceBody.quaternion));
      currentState.pawnGroup.position.copy(cannonToThree(pawnBody.position));
      currentState.pawnGroup.rotation.y += isRollingRef.current ? 0.022 : 0.004;

      cameraIntro = Math.min(1, cameraIntro + delta * 0.65);
      const cameraStart = new THREE.Vector3(0, 8.4, 13.4);
      const cameraTarget = new THREE.Vector3(5.25, 6.15, 8.45);
      camera.position.copy(cameraStart.lerp(cameraTarget, easeOutCubic(cameraIntro)));
      camera.lookAt(0, 0, 0);

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
      animationId: window.requestAnimationFrame(animate),
    };

    return () => {
      resizeObserver.disconnect();
      if (sceneRef.current) {
        window.cancelAnimationFrame(sceneRef.current.animationId);
      }
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      mountElement.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [boardSpaces]);

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

    state.pawnTarget.copy(getBoardPosition(positionIndex % boardSpaces.length).clone().setY(0.48));
  }, [boardSpaces.length, positionIndex]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state || rollNonce === 0) {
      return;
    }

    const push = 3.2 + (rollResult % 5) * 0.3;
    state.diceBody.position.set(-1.55, 1.2, -0.25);
    state.diceBody.velocity.set(push, 4.0, 1.1 - (rollResult % 3));
    state.diceBody.angularVelocity.set(8.5 + rollResult * 0.34, 7.2, 5.2 + rollResult * 0.16);
    state.diceBody.quaternion.setFromEuler(rollResult * 0.1, rollResult * 0.2, rollResult * 0.3);
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

function addTableLegs(scene: THREE.Scene, material: THREE.Material) {
  const legGeometry = new THREE.BoxGeometry(0.36, 1.35, 0.36);
  const legPositions = [
    [-4.25, -1.0, -3.05],
    [4.25, -1.0, -3.05],
    [-4.25, -1.0, 3.05],
    [4.25, -1.0, 3.05],
  ];

  legPositions.forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(legGeometry, material);
    leg.position.set(x, y, z);
    scene.add(leg);
  });
}

function addTabletopDetails(scene: THREE.Scene) {
  const grainMaterial = new THREE.MeshBasicMaterial({ color: 0x8b5a36, transparent: true, opacity: 0.18 });
  for (let index = 0; index < 9; index += 1) {
    const grain = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 0.018), grainMaterial);
    grain.position.set(0, -0.095, -3.05 + index * 0.76);
    grain.rotation.x = -Math.PI / 2;
    scene.add(grain);
  }

  const notebook = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.05, 0.78),
    new THREE.MeshStandardMaterial({ color: 0xe7dcc4, roughness: 0.76 }),
  );
  notebook.position.set(-3.78, 0.02, -2.48);
  notebook.rotation.y = 0.2;
  scene.add(notebook);

  const pen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.9, 12),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.42, metalness: 0.2 }),
  );
  pen.position.set(-3.55, 0.12, -2.28);
  pen.rotation.z = Math.PI / 2;
  pen.rotation.y = -0.36;
  scene.add(pen);

  const coffee = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.18, 0.34, 20),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.48 }),
  );
  coffee.position.set(3.9, 0.05, 2.62);
  scene.add(coffee);

  const laptop = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.05, 0.72),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55, metalness: 0.18 }),
  );
  laptop.position.set(3.55, 0.01, -2.65);
  laptop.rotation.y = -0.18;
  scene.add(laptop);
}

function createD20Mesh() {
  const group = new THREE.Group();
  const diceGeometry = new THREE.IcosahedronGeometry(0.38, 0);
  const diceMaterial = new THREE.MeshStandardMaterial({ color: 0xf4b83c, roughness: 0.38, metalness: 0.14 });
  const dice = new THREE.Mesh(diceGeometry, diceMaterial);
  group.add(dice);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(diceGeometry),
    new THREE.LineBasicMaterial({ color: 0x6f4211, transparent: true, opacity: 0.75 }),
  );
  group.add(edges);

  const mark = createLabelMesh("20", "#3b2507", { width: 96, height: 96, fontSize: 42 });
  mark.position.set(0, 0.39, 0);
  mark.rotation.x = -Math.PI / 2;
  mark.scale.setScalar(0.45);
  group.add(mark);

  return group;
}

function addBoardSpaces(scene: THREE.Scene, boardSpaces: CyberBoardSpace[]) {
  for (let index = 0; index < boardSpaceCount; index += 1) {
    const space = getBoardSpace(index);
    const isCorner = space.corner === true;
    const boardSpace = boardSpaces[index];
    const material = new THREE.MeshStandardMaterial({
      color: getSpaceColor(boardSpace.tone, isCorner),
      roughness: 0.72,
      metalness: 0.02,
    });
    const isVertical = space.side === "left" || space.side === "right";
    const tileGeometry = new THREE.BoxGeometry(
      isCorner ? 1.1 : isVertical ? 0.82 : 1.12,
      0.08,
      isCorner ? 0.92 : isVertical ? 0.9 : 0.76,
    );
    const tile = new THREE.Mesh(tileGeometry, material);
    tile.position.copy(getBoardPosition(index));
    tile.position.y = 0.13;
    scene.add(tile);

    const label = createLabelMesh(boardSpace.label, getSpaceTextColor(boardSpace.tone, isCorner));
    label.position.copy(tile.position);
    label.position.y = 0.18;
    label.rotation.x = -Math.PI / 2;
    if (space.side === "right") {
      label.rotation.z = -Math.PI / 2;
    } else if (space.side === "left") {
      label.rotation.z = Math.PI / 2;
    } else if (space.side === "bottom") {
      label.rotation.z = Math.PI;
    }
    scene.add(label);
  }
}

function getSpaceColor(tone: CyberBoardSpace["tone"], isCorner: boolean) {
  if (tone === "inject") {
    return 0x7c2d12;
  }

  if (isCorner || tone === "start") {
    return 0x0f766e;
  }

  const colors: Record<CyberBoardSpace["tone"], number> = {
    start: 0x0f766e,
    triage: 0x1d4ed8,
    decision: 0x4338ca,
    technical: 0x172554,
    business: 0x334155,
    recovery: 0x14532d,
    gap: 0x4a2d0b,
    inject: 0x7c2d12,
  };

  return colors[tone];
}

function getSpaceTextColor(tone: CyberBoardSpace["tone"], isCorner: boolean) {
  if (tone === "inject" || tone === "gap") {
    return "#fbbf24";
  }

  if (isCorner || tone === "start") {
    return "#ffffff";
  }

  return "#d8fff1";
}

function addCardDecks(scene: THREE.Scene) {
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x13251f, roughness: 0.66 });
  const injectMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2814, roughness: 0.66 });

  for (let index = 0; index < 4; index += 1) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.035, 1.16), deckMaterial);
    card.position.set(-1.25 + index * 0.035, 0.22 + index * 0.018, 0.08);
    card.rotation.y = 0.46;
    scene.add(card);
  }

  for (let index = 0; index < 3; index += 1) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.035, 1.16), injectMaterial);
    card.position.set(1.25 + index * 0.035, 0.22 + index * 0.018, -0.08);
    card.rotation.y = -0.48;
    scene.add(card);
  }

  const promptLabel = createLabelMesh("Prompt Deck", "#d8fff1", { width: 220, height: 80, fontSize: 22 });
  promptLabel.position.set(-1.25, 0.32, 0.08);
  promptLabel.rotation.set(-Math.PI / 2, 0, 0.46);
  scene.add(promptLabel);

  const injectLabel = createLabelMesh("Inject Deck", "#fbbf24", { width: 220, height: 80, fontSize: 22 });
  injectLabel.position.set(1.25, 0.32, -0.08);
  injectLabel.rotation.set(-Math.PI / 2, 0, -0.48);
  scene.add(injectLabel);
}

function createPawnMesh(pawn: PawnOption) {
  const group = new THREE.Group();
  const mainMaterial = new THREE.MeshStandardMaterial({ color: pawn.color, roughness: 0.42, metalness: 0.16 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: pawn.accent, roughness: 0.5 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 0.18, 18), accentMaterial);
  base.position.y = 0.05;
  group.add(base);

  const body =
    pawn.key === "spark"
      ? new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), mainMaterial)
      : pawn.key === "anchor"
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.48, 18), mainMaterial)
        : pawn.key === "prism"
          ? new THREE.Mesh(new THREE.OctahedronGeometry(0.32), mainMaterial)
          : new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.56, 18), mainMaterial);

  body.position.y = 0.38;
  group.add(body);

  const glow = new THREE.PointLight(pawn.color, 0.58, 1.45);
  glow.position.set(0, 0.65, 0);
  group.add(glow);

  return group;
}

function createLabelMesh(text: string, color: string, options?: { width?: number; height?: number; fontSize?: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = options?.width ?? 192;
  canvas.height = options?.height ?? 72;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(6, 12, 20, 0.72)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(35, 211, 155, 0.52)";
    context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    context.fillStyle = color;
    context.font = `bold ${options?.fontSize ?? 22}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  return new THREE.Mesh(new THREE.PlaneGeometry(options?.width ? 1.18 : 0.92, options?.height ? 0.36 : 0.34), material);
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
