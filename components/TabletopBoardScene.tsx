"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { addScenarioSpinner, getScenarioAccentColor } from "@/components/board-set-pieces";
import {
  HOP_MS,
  pawnOptions,
  spaceEffects,
  toneMeta,
  type BoardNode,
  type BoardSpaceTone,
  type DiceRoll,
  type PawnKey,
  type PawnOption,
} from "@/components/tabletop-board-config";

export type CameraMode = "follow" | "overview" | "top";

export interface DeckDraw {
  nonce: number;
  deck: "prompt" | "inject";
}

export interface PawnMove {
  nonce: number;
  /** Node ids to hop through, in order. */
  path: number[];
  /** Steps still owed after this path (non-zero when pausing at a fork). */
  stepsAfter: number;
}

interface TabletopBoardSceneProps {
  pawn: PawnKey;
  nodes: BoardNode[];
  move: PawnMove | null;
  dice: DiceRoll | null;
  diceReady: boolean;
  junction: number[] | null;
  deckDraw: DeckDraw | null;
  resetNonce: number;
  cameraMode: CameraMode;
  sceneTitle?: string;
  sceneSubtitle?: string;
  onDiceClick?: () => void;
  onJunctionPick?: (nodeId: number) => void;
  onHop?: (step: number) => void;
  onLand?: (nodeId: number) => void;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const SPACE_Y = 0.16;
const SPACE_RADIUS = 0.5;
const FOLLOW_OFFSET = new THREE.Vector3(0, 7.2, 7.8);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0.6);
const OVERVIEW_CAMERA = new THREE.Vector3(0, 15.5, 15.5);
const TOP_CAMERA = new THREE.Vector3(0, 22, 1.2);
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const SPIN_MS = 1050;
const SETTLE_MS = 420;
const DECK_SLOTS = {
  prompt: { x: -1.75, z: 0.9, rotation: 0.22 },
  inject: { x: 1.75, z: 0.9, rotation: -0.22 },
} as const;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface HoverInfo {
  nodeId: number;
  x: number;
  y: number;
}

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  nodes: BoardNode[];
  spaceMeshes: THREE.Mesh[];
  pawnGroup: THREE.Group;
  pawnShadow: THREE.Mesh;
  ring: THREE.Mesh;
  counter: CounterSprite;
  dice: FloatingDice;
  arrows: THREE.Group[];
  decks: Record<"prompt" | "inject", DeckRig>;
  effects: Effect[];
  hop: HopState;
  cameraTween: CameraTween | null;
  cameraMode: CameraMode;
  ambient: Ambient;
  animationId: number;
}

export function TabletopBoardScene({
  pawn,
  nodes,
  move,
  dice,
  diceReady,
  junction,
  deckDraw,
  resetNonce,
  cameraMode,
  sceneTitle = "Incident Response",
  sceneSubtitle = "TabletopForge",
  onDiceClick,
  onJunctionPick,
  onHop,
  onLand,
}: TabletopBoardSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<SceneState | null>(null);
  const callbacksRef = useRef({ onDiceClick, onJunctionPick, onHop, onLand, diceReady });
  const initialPawnRef = useRef(pawn);
  const [sceneError, setSceneError] = useState("");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");

  useEffect(() => {
    callbacksRef.current = { onDiceClick, onJunctionPick, onHop, onLand, diceReady };
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    const mountElement = mount;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setSceneError("3D rendering is unavailable on this device or browser.");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    mountElement.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = createSkyTexture();
    scene.fog = new THREE.Fog(0xdcd0ff, 34, 70);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);
    const startNode = nodes[0];
    camera.position.set(0, 26, 24);
    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(OVERVIEW_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 30;
    controls.maxPolarAngle = 1.32;
    controls.screenSpacePanning = false;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;

    addLighting(scene);
    addIsland(scene);
    addPaths(scene, nodes);
    const spaceMeshes = addSpaces(scene, nodes);
    addLandmarks(scene);
    const ambient = addDecor(scene);
    addCenterpiece(scene, sceneTitle, sceneSubtitle, ambient);
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    const decks = {
      prompt: createDeck(scene, "prompt", anisotropy),
      inject: createDeck(scene, "inject", anisotropy),
    };

    const pawnGroup = createPawnMesh(pawnOptions.find((option) => option.key === initialPawnRef.current) ?? pawnOptions[0]);
    pawnGroup.position.set(startNode.x, SPACE_Y, startNode.z);
    pawnGroup.rotation.y = facingBetween(startNode, nodes[startNode.next[0]]);
    scene.add(pawnGroup);

    const pawnShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: createRadialTexture("rgba(40,20,60,0.55)", "rgba(40,20,60,0)"), transparent: true, depthWrite: false }),
    );
    pawnShadow.rotation.x = -Math.PI / 2;
    pawnShadow.renderOrder = 1;
    scene.add(pawnShadow);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.56, 0.68, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(startNode.x, SPACE_Y + 0.01, startNode.z);
    scene.add(ring);

    const counter = createCounterSprite();
    scene.add(counter.sprite);

    const floatingDice = createFloatingDice(scene);

    const resize = () => {
      const width = mountElement.clientWidth;
      const height = mountElement.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.fov = camera.aspect < 0.9 ? 56 : camera.aspect < 1.3 ? 46 : 40;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mountElement);

    /* ---------------- pointer interaction ---------------- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    let pendingPointer: PointerEvent | null = null;

    const pick = (event: PointerEvent) => {
      const state = stateRef.current;
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      let arrowNode = -1;
      if (state && state.arrows.length > 0) {
        const hit = raycaster.intersectObjects(state.arrows, true)[0];
        if (hit) {
          let object: THREE.Object3D | null = hit.object;
          while (object && object.userData.nodeId === undefined) {
            object = object.parent;
          }
          arrowNode = (object?.userData.nodeId as number | undefined) ?? -1;
        }
      }
      const diceHit =
        state !== null && state.dice.visible > 0.5 && raycaster.intersectObjects([state.dice.d6.group, state.dice.d20.group], true).length > 0;
      const spaceHit = raycaster.intersectObjects(spaceMeshes, false)[0];
      return {
        arrowNode,
        diceHit,
        nodeId: spaceHit ? (spaceHit.object.userData.nodeId as number) : -1,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      pendingPointer = event;
    };
    const handlePointerLeave = () => {
      pendingPointer = null;
      setHover(null);
      setCursor("grab");
    };
    const handlePointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerDown) {
        return;
      }
      const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
      pointerDown = null;
      if (moved > 6) {
        return;
      }
      const result = pick(event);
      if (result.arrowNode >= 0) {
        callbacksRef.current.onJunctionPick?.(result.arrowNode);
      } else if (result.diceHit && callbacksRef.current.diceReady) {
        callbacksRef.current.onDiceClick?.();
      }
    };
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    controls.addEventListener("start", () => {
      const state = stateRef.current;
      if (state) {
        state.cameraTween = null;
      }
    });

    /* ---------------- render loop ---------------- */
    let previous = performance.now();
    const introStart = previous;
    const introFrom = camera.position.clone();
    const desiredTarget = new THREE.Vector3();

    const animate = () => {
      const state = stateRef.current;
      if (!state) {
        return;
      }
      const now = performance.now();
      const elapsed = now / 1000;
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;

      if (pendingPointer) {
        const result = pick(pendingPointer);
        pendingPointer = null;
        const clickable = result.arrowNode >= 0 || (result.diceHit && callbacksRef.current.diceReady);
        setCursor(clickable ? "pointer" : "grab");
        setHover(result.nodeId >= 0 && !clickable ? { nodeId: result.nodeId, x: result.x, y: result.y } : null);
      }

      const moving = updateHop(state, now, reducedMotion);
      if (!moving) {
        state.pawnGroup.children[0].position.y = Math.sin(elapsed * 2.6) * 0.03;
      }
      const pawnPosition = state.pawnGroup.position;
      state.pawnShadow.position.set(pawnPosition.x, SPACE_Y + 0.012, pawnPosition.z);
      const lift = Math.max(0, pawnPosition.y - SPACE_Y);
      state.pawnShadow.scale.setScalar(1.3 - lift * 0.5);
      (state.pawnShadow.material as THREE.MeshBasicMaterial).opacity = 1 - lift * 0.6;
      state.ring.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.06);
      (state.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(elapsed * 4) * 0.25;

      updateDice(state, now, delta, elapsed);
      updateCounter(state, elapsed);
      updateArrows(state, elapsed);
      updateDecks(state.decks, now);
      updateEffects(state, delta);
      updateAmbient(state.ambient, elapsed, delta);

      // Camera: intro swoop, explicit tweens, then follow-cam.
      const introT = Math.min(1, (now - introStart) / (reducedMotion ? 1 : 2600));
      if (introT < 1) {
        const eased = easeInOutCubic(introT);
        desiredTarget.set(startNode.x, 0, startNode.z);
        controls.target.lerpVectors(OVERVIEW_TARGET, desiredTarget, eased);
        camera.position.lerpVectors(introFrom, desiredTarget.clone().add(FOLLOW_OFFSET), eased);
      } else if (state.cameraTween) {
        const tween = state.cameraTween;
        const t = Math.min(1, (now - tween.start) / tween.duration);
        const eased = easeInOutCubic(t);
        camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
        if (t >= 1) {
          state.cameraTween = null;
        }
      } else if (state.cameraMode === "follow") {
        desiredTarget.set(pawnPosition.x, 0, pawnPosition.z);
        const step = desiredTarget.sub(controls.target).multiplyScalar(reducedMotion ? 1 : Math.min(1, delta * 3));
        controls.target.add(step);
        camera.position.add(step);
      }

      controls.update();
      renderer.render(scene, camera);
      state.animationId = window.requestAnimationFrame(animate);
    };

    stateRef.current = {
      renderer,
      scene,
      camera,
      controls,
      nodes,
      spaceMeshes,
      pawnGroup,
      pawnShadow,
      ring,
      counter,
      dice: floatingDice,
      arrows: [],
      decks,
      effects: [],
      hop: {
        queue: [],
        current: null,
        nodeId: 0,
        stepCount: 0,
        stepsAfter: 0,
        onHop: (step) => callbacksRef.current.onHop?.(step),
        onLand: (id) => callbacksRef.current.onLand?.(id),
      },
      cameraTween: null,
      cameraMode: "follow",
      ambient,
      animationId: window.requestAnimationFrame(animate),
    };

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      if (stateRef.current) {
        window.cancelAnimationFrame(stateRef.current.animationId);
      }
      controls.dispose();
      disposeObject(scene);
      environment.dispose();
      (scene.background as THREE.Texture | null)?.dispose();
      renderer.dispose();
      if (canvas.parentElement === mountElement) {
        mountElement.removeChild(canvas);
      }
      stateRef.current = null;
    };
  }, [nodes, sceneSubtitle, sceneTitle]);

  // Swap the pawn model when a new one is chosen.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    const option = pawnOptions.find((item) => item.key === pawn) ?? pawnOptions[0];
    const next = createPawnMesh(option);
    next.position.copy(state.pawnGroup.position);
    next.rotation.copy(state.pawnGroup.rotation);
    state.scene.remove(state.pawnGroup);
    disposeObject(state.pawnGroup);
    state.scene.add(next);
    state.pawnGroup = next;
    const node = state.nodes[state.hop.nodeId];
    spawnBurst(state, node.x, node.z, option.color);
  }, [pawn]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state || !move) {
      return;
    }
    state.hop.queue.push(...move.path);
    state.hop.stepsAfter = move.stepsAfter;
    state.hop.stepCount = 0;
    state.dice.mode = "hidden";
  }, [move]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state || resetNonce === 0) {
      return;
    }
    const node = state.nodes[0];
    state.hop.queue = [];
    state.hop.current = null;
    state.hop.nodeId = 0;
    state.hop.stepsAfter = 0;
    state.pawnGroup.position.set(node.x, SPACE_Y, node.z);
    state.ring.position.set(node.x, SPACE_Y + 0.01, node.z);
    state.dice.mode = "hidden";
    spawnBurst(state, node.x, node.z);
  }, [resetNonce]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state || !dice) {
      return;
    }
    const rig = state.dice;
    rig.mode = "rolling";
    rig.start = performance.now();
    rig.value = dice;
    rig.finalized = false;
  }, [dice]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    if (diceReady && state.dice.mode === "hidden") {
      state.dice.mode = "idle";
    } else if (!diceReady && state.dice.mode === "idle") {
      state.dice.mode = "hidden";
    }
  }, [diceReady]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    state.arrows.forEach((arrow) => {
      state.scene.remove(arrow);
      disposeObject(arrow);
    });
    state.arrows = [];
    if (!junction || junction.length === 0) {
      return;
    }
    const from = state.nodes[state.hop.nodeId];
    junction.forEach((nodeId) => {
      const to = state.nodes[nodeId];
      const arrow = createJunctionArrow(to.route === "shortcut" ? 0xff8a3d : 0x2fd39c);
      const direction = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
      arrow.position.set(from.x + direction.x * 1.15, SPACE_Y + 0.45, from.z + direction.z * 1.15);
      arrow.rotation.y = Math.atan2(direction.x, direction.z);
      arrow.userData.nodeId = nodeId;
      arrow.userData.baseY = arrow.position.y;
      arrow.userData.direction = direction;
      state.scene.add(arrow);
      state.arrows.push(arrow);
    });
  }, [junction]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state || !deckDraw) {
      return;
    }
    state.decks[deckDraw.deck].drawStart = performance.now();
  }, [deckDraw]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    const previousMode = state.cameraMode;
    state.cameraMode = cameraMode;
    if (previousMode === cameraMode && cameraMode === "follow") {
      return;
    }
    const pawnPosition = state.pawnGroup.position;
    let toTarget = OVERVIEW_TARGET.clone();
    let toPosition = OVERVIEW_CAMERA.clone();
    if (cameraMode === "top") {
      toPosition = TOP_CAMERA.clone();
    } else if (cameraMode === "follow") {
      toTarget = new THREE.Vector3(pawnPosition.x, 0, pawnPosition.z);
      toPosition = toTarget.clone().add(FOLLOW_OFFSET);
    }
    state.cameraTween = {
      start: performance.now(),
      duration: 900,
      fromPosition: state.camera.position.clone(),
      toPosition,
      fromTarget: state.controls.target.clone(),
      toTarget,
    };
  }, [cameraMode]);

  if (sceneError) {
    return (
      <div className="flex h-full min-h-[28rem] w-full items-center justify-center p-6 text-center" aria-label="3D game board unavailable">
        <div className="max-w-md rounded-xl border border-border bg-background/70 p-5">
          <p className="text-lg font-semibold text-foreground">3D board unavailable</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {sceneError} Switch to Classic Mode to keep running the tabletop.
          </p>
        </div>
      </div>
    );
  }

  const hoverNode = hover ? nodes[hover.nodeId] : null;
  const hoverTone = hoverNode ? toneMeta[hoverNode.tone] : null;
  const hoverEffect = hoverNode ? spaceEffects[hoverNode.tone] : null;

  return (
    <div className="relative h-full min-h-[28rem] w-full">
      <div
        ref={mountRef}
        className={`absolute inset-0 ${cursor === "pointer" ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
        role="img"
        aria-label="3D party game board. Drag to orbit, scroll to zoom, click the floating dice to roll."
      />
      {hover && hoverNode && hoverTone && hoverEffect ? (
        <div
          className="board-tooltip pointer-events-none absolute z-20 w-60 rounded-2xl border border-white/60 bg-white/90 p-3 text-[#1c1633] shadow-xl shadow-purple-900/20 backdrop-blur"
          style={{
            left: Math.min(hover.x + 16, (mountRef.current?.clientWidth ?? 600) - 250),
            top: Math.max(8, hover.y - 110),
          }}
        >
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: hoverTone.color }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: hoverTone.color }}>
              {hoverTone.label}
            </span>
            {hoverNode.route === "shortcut" ? <span className="rounded-full bg-orange-100 px-1.5 text-[10px] font-bold text-orange-600">Shortcut</span> : null}
            {hoverEffect.points !== 0 ? (
              <span className={`ml-auto text-xs font-black ${hoverEffect.points > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {hoverEffect.points > 0 ? "+" : ""}
                {hoverEffect.points}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-base font-black">{hoverNode.label}</p>
          <p className="mt-1 text-xs leading-5 text-[#1c1633]/70">{hoverTone.hint}</p>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* World construction                                                  */
/* ------------------------------------------------------------------ */

function addLighting(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc7b6ee, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e2, 2.4);
  key.position.set(8, 16, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 50;
  key.shadow.camera.left = -14;
  key.shadow.camera.right = 14;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 5;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9e6ff, 0.6);
  fill.position.set(-10, 8, -6);
  scene.add(fill);
}

function addIsland(scene: THREE.Scene) {
  const width = 23;
  const depth = 16;
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.3, depth - 0.3),
    new THREE.MeshStandardMaterial({ map: createPlazaTexture(), roughness: 0.85 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.001;
  top.receiveShadow = true;
  scene.add(top);

  const slab = new THREE.Mesh(
    new RoundedBoxGeometry(width, 1.1, depth, 4, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xf6e7f2, roughness: 0.7 }),
  );
  slab.position.y = -0.551;
  slab.receiveShadow = true;
  scene.add(slab);

  const trim = new THREE.Mesh(
    new RoundedBoxGeometry(width + 0.25, 0.28, depth + 0.25, 4, 0.14),
    new THREE.MeshStandardMaterial({ color: 0xff9ec7, roughness: 0.5 }),
  );
  trim.position.y = -0.85;
  scene.add(trim);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(9.5, 3.5, 4.5, 40, 1),
    new THREE.MeshStandardMaterial({ color: 0xc6b3f2, roughness: 0.9, flatShading: true }),
  );
  base.scale.set(1.2, 1, 0.85);
  base.position.y = -3.3;
  scene.add(base);
}

function addPaths(scene: THREE.Scene, nodes: BoardNode[]) {
  const main = nodes.filter((node) => node.route === "main");
  const mainCurve = new THREE.CatmullRomCurve3(
    main.map((node) => new THREE.Vector3(node.x, 0, node.z)),
    true,
    "catmullrom",
    0.5,
  );
  addRibbon(scene, mainCurve, 1.32, 0.02, 0xe2c792, 400);
  addRibbon(scene, mainCurve, 1.0, 0.04, 0xfff3d6, 400);

  // Shortcuts: from each fork node through its shortcut chain back to the main loop.
  nodes
    .filter((node) => node.route === "main" && node.next.length > 1)
    .forEach((fork) => {
      const chain: BoardNode[] = [fork];
      let cursor = nodes[fork.next[1]];
      while (cursor.route === "shortcut") {
        chain.push(cursor);
        cursor = nodes[cursor.next[0]];
      }
      chain.push(cursor);
      const curve = new THREE.CatmullRomCurve3(chain.map((node) => new THREE.Vector3(node.x, 0, node.z)), false, "catmullrom", 0.5);
      addRibbon(scene, curve, 1.26, 0.022, 0xb59ae8, 160);
      addRibbon(scene, curve, 0.96, 0.042, 0xe7dcff, 160);
    });

  // Direction chevrons painted between spaces.
  const chevron = createChevronGeometry();
  const chevronMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const forkChevron = new THREE.MeshBasicMaterial({ color: 0xff8a3d, side: THREE.DoubleSide });
  nodes.forEach((node) => {
    node.next.forEach((nextId, index) => {
      const next = nodes[nextId];
      const isFork = node.next.length > 1;
      if (!isFork && node.id % 2 === 1 && node.route === "main") {
        return;
      }
      const mesh = new THREE.Mesh(chevron, isFork && index === 1 ? forkChevron : chevronMaterial);
      mesh.position.set((node.x + next.x) / 2, 0.05, (node.z + next.z) / 2);
      mesh.rotation.y = facingBetween(node, next);
      scene.add(mesh);
    });
  });
}

function addRibbon(scene: THREE.Scene, curve: THREE.Curve<THREE.Vector3>, width: number, y: number, color: number, segments: number) {
  const points = curve.getSpacedPoints(segments);
  const positions: number[] = [];
  const indices: number[] = [];
  points.forEach((point, index) => {
    const ahead = points[Math.min(points.length - 1, index + 1)];
    const behind = points[Math.max(0, index - 1)];
    const tangent = new THREE.Vector3().subVectors(ahead, behind).setY(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
    positions.push(point.x + normal.x, y, point.z + normal.z, point.x - normal.x, y, point.z - normal.z);
    if (index < points.length - 1) {
      const a = index * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Round caps hide the seams where ribbons meet.
  [points[0], points[points.length - 1]].forEach((point) => {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 32), material);
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(point.x, y, point.z);
    cap.receiveShadow = true;
    scene.add(cap);
  });
}

function createChevronGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.2);
  shape.lineTo(0.2, -0.02);
  shape.lineTo(0.2, -0.16);
  shape.lineTo(0, 0.06);
  shape.lineTo(-0.2, -0.16);
  shape.lineTo(-0.2, -0.02);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  // Lay flat with the tip pointing along +Z so rotation.y = atan2(dx, dz) aims it.
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function addSpaces(scene: THREE.Scene, nodes: BoardNode[]) {
  const textures = new Map<string, THREE.Texture>();
  const sideMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const meshes: THREE.Mesh[] = [];
  nodes.forEach((node) => {
    const isStart = node.id === 0;
    const key = isStart ? "start-big" : node.tone;
    if (!textures.has(key)) {
      textures.set(key, createSpaceTexture(node.tone, isStart));
    }
    const radius = isStart ? SPACE_RADIUS * 1.35 : SPACE_RADIUS;
    const topMaterial = new THREE.MeshStandardMaterial({ map: textures.get(key), roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.06 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, 0.14, 40), [sideMaterial, topMaterial, sideMaterial]);
    mesh.position.set(node.x, SPACE_Y - 0.07, node.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.nodeId = node.id;
    scene.add(mesh);
    meshes.push(mesh);
  });
  return meshes;
}

/* ------------------------------------------------------------------ */
/* Landmarks & decor                                                   */
/* ------------------------------------------------------------------ */

function addLandmarks(scene: THREE.Scene) {
  // Security Operations Center with a radar dish.
  const soc = makeBuilding(scene, { x: -9.4, z: -5.4, w: 3, h: 2.4, d: 2.2, color: 0x8fc9ff, roof: 0x4f7fe0, sign: "SOC", signColor: "#2a58c9" });
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.3 }),
  );
  dish.rotation.x = Math.PI * 0.75;
  dish.position.set(0.6, 2.95, 0);
  soc.add(dish);

  // Comms tower.
  const tower = new THREE.Group();
  tower.position.set(9.6, 0, -5.6);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 4.6, 16), new THREE.MeshStandardMaterial({ color: 0xffb3d1, roughness: 0.5 }));
  mast.position.y = 2.3;
  mast.castShadow = true;
  tower.add(mast);
  [1.6, 2.6, 3.6].forEach((y, index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 - index * 0.1, 0.06, 10, 32), new THREE.MeshStandardMaterial({ color: 0xff6fa8 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    tower.add(ring);
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff3d6e }));
  beacon.position.y = 4.75;
  beacon.name = "beacon";
  tower.add(beacon);
  tower.add(makeSign("COMMS", "#d63a7a", 0, 1.0, 0.5));
  scene.add(tower);

  // Backup vault.
  const vault = new THREE.Group();
  vault.position.set(9.6, 0, 4.8);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1.4, 32), new THREE.MeshStandardMaterial({ color: 0xa8efc4, roughness: 0.45 }));
  drum.position.y = 0.7;
  drum.castShadow = true;
  vault.add(drum);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3fcf8e, roughness: 0.35 }),
  );
  dome.position.y = 1.4;
  dome.castShadow = true;
  vault.add(dome);
  vault.add(makeSign("BACKUPS", "#1f9c63", 0, 0.75, 1.22));
  scene.add(vault);

  // Legal office with columns.
  const legal = makeBuilding(scene, { x: -9.6, z: 4.8, w: 2.6, h: 1.4, d: 2, color: 0xfff4dc, roof: 0xb18cf0, sign: "LEGAL", signColor: "#7a4fd6" });
  for (let column = -1; column <= 1; column += 1) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    pillar.position.set(column * 0.8, 0.7, 1.15);
    pillar.castShadow = true;
    legal.add(pillar);
  }

  // Executive tower behind the board.
  const exec = makeBuilding(scene, { x: 0, z: -7.1, w: 3.2, h: 3.4, d: 1.4, color: 0xffd7a8, roof: 0xff9f43, sign: "EXEC SUITE", signColor: "#d4721c" });
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1, 4), new THREE.MeshStandardMaterial({ color: 0xff9f43 }));
  crown.position.y = 4.1;
  crown.rotation.y = Math.PI / 4;
  crown.castShadow = true;
  exec.add(crown);

  makeBuilding(scene, { x: -4.6, z: -6.8, w: 1.6, h: 1.1, d: 1.1, color: 0xc9f3ff, roof: 0x38bdf8, sign: "HELP DESK", signColor: "#0e86b8" });
  makeBuilding(scene, { x: 4.6, z: -6.8, w: 1.6, h: 1.1, d: 1.1, color: 0xffe0ef, roof: 0xf472b6, sign: "HR", signColor: "#c2417f" });
}

function makeBuilding(
  scene: THREE.Scene,
  options: { x: number; z: number; w: number; h: number; d: number; color: number; roof: number; sign: string; signColor: string },
) {
  const group = new THREE.Group();
  group.position.set(options.x, 0, options.z);
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(options.w, options.h, options.d, 3, 0.12),
    new THREE.MeshStandardMaterial({ color: options.color, roughness: 0.55 }),
  );
  body.position.y = options.h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const roof = new THREE.Mesh(
    new RoundedBoxGeometry(options.w + 0.3, 0.25, options.d + 0.3, 3, 0.1),
    new THREE.MeshStandardMaterial({ color: options.roof, roughness: 0.4 }),
  );
  roof.position.y = options.h + 0.1;
  roof.castShadow = true;
  group.add(roof);

  const windows = new THREE.Mesh(
    new THREE.PlaneGeometry(options.w * 0.82, options.h * 0.45),
    new THREE.MeshStandardMaterial({ map: createWindowTexture(), transparent: true, emissive: 0xfff6c8, emissiveIntensity: 0.15 }),
  );
  windows.position.set(0, options.h * 0.66, options.d / 2 + 0.01);
  group.add(windows);
  group.add(makeSign(options.sign, options.signColor, 0, Math.min(options.h * 0.28, 0.5) + 0.1, options.d / 2 + 0.02));
  scene.add(group);
  return group;
}

function makeSign(text: string, color: string, x: number, y: number, z: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    roundRect(ctx, 6, 6, 500, 116, 50);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 60px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setLetterSpacing(ctx, "4px");
    ctx.fillText(text, 256, 68);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  sign.position.set(x, y, z);
  return sign;
}

interface Ambient {
  clouds: THREE.Group[];
  spinner: THREE.Group | null;
  beacon: THREE.Object3D | null;
  fountain: THREE.Points | null;
}

function addDecor(scene: THREE.Scene): Ambient {
  const treeSpots: Array<[number, number, number]> = [
    [-10.3, -1.2, 0x7ed99b],
    [-10.4, 1.6, 0xffa8cf],
    [10.4, -1.6, 0x7ed99b],
    [10.3, 1.4, 0xffc670],
    [-5.0, 0.2, 0x9be7b5],
    [5.0, -0.2, 0x9be7b5],
    [-6.6, -7.1, 0xffa8cf],
    [6.8, -7.1, 0x7ed99b],
    [-2.6, 7.0, 0x7ed99b],
    [2.8, 7.0, 0xffa8cf],
    [-7.6, 7.0, 0xffc670],
    [7.6, 7.0, 0x9be7b5],
  ];
  treeSpots.forEach(([x, z, color], index) => {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0xb8835a }));
    trunk.position.y = 0.4;
    trunk.castShadow = true;
    tree.add(trunk);
    const leafMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true });
    [
      [0, 1.15, 0, 0.62],
      [0.3, 0.95, 0.15, 0.42],
      [-0.28, 1.0, -0.1, 0.45],
    ].forEach(([lx, ly, lz, r]) => {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMaterial);
      leaf.position.set(lx, ly, lz);
      leaf.castShadow = true;
      tree.add(leaf);
    });
    tree.scale.setScalar(0.9 + (index % 3) * 0.15);
    scene.add(tree);
  });

  [-5.4, 5.4].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x6d5bd0 }));
    post.position.set(x, 0.8, 6.9);
    post.castShadow = true;
    scene.add(post);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xfff3b0, emissiveIntensity: 0.8 }),
    );
    bulb.position.set(x, 1.65, 6.9);
    scene.add(bulb);
  });

  // Bunting strung across the back of the plaza.
  const flagColors = [0xff6fa8, 0xffc857, 0x5ccfe6, 0x7ed99b, 0xb18cf0];
  for (let index = 0; index < 22; index += 1) {
    const t = index / 21;
    const flag = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.4, 3),
      new THREE.MeshStandardMaterial({ color: flagColors[index % flagColors.length] }),
    );
    flag.position.set(-8.5 + t * 17, 4.9 - Math.sin(t * Math.PI) * 0.8, -6.3);
    flag.rotation.x = Math.PI;
    scene.add(flag);
  }

  const clouds: THREE.Group[] = [];
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  [
    [-16, 6, -10],
    [15, 7, -12],
    [-19, 3.5, 6],
    [18, 4, 7],
    [0, 9, -20],
  ].forEach(([x, y, z], index) => {
    const cloud = new THREE.Group();
    [
      [0, 0, 0, 1.4],
      [1.3, -0.2, 0.2, 1],
      [-1.3, -0.25, 0, 1.05],
      [0.5, 0.5, -0.3, 0.9],
    ].forEach(([cx, cy, cz, r]) => {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cloudMaterial);
      puff.position.set(cx, cy, cz);
      cloud.add(puff);
    });
    cloud.position.set(x, y, z);
    cloud.userData.phase = index * 1.3;
    cloud.userData.baseY = y;
    scene.add(cloud);
    clouds.push(cloud);
  });

  return { clouds, spinner: null, beacon: scene.getObjectByName("beacon") ?? null, fountain: null };
}

function addCenterpiece(scene: THREE.Scene, sceneTitle: string, sceneSubtitle: string, ambient: Ambient) {
  const accent = getScenarioAccentColor(sceneTitle.toLowerCase());
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.35, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
  basin.position.set(0, 0.175, -0.9);
  basin.castShadow = true;
  basin.receiveShadow = true;
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 0.05, 48),
    new THREE.MeshStandardMaterial({ color: 0x7fd8ff, roughness: 0.1, metalness: 0.1, emissive: 0x2a9fd6, emissiveIntensity: 0.25 }),
  );
  water.position.set(0, 0.33, -0.9);
  scene.add(water);

  const spinner = new THREE.Group();
  spinner.position.set(0, 0.95, -0.9);
  spinner.scale.setScalar(1.25);
  addScenarioSpinner(spinner, sceneTitle, accent);
  spinner.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
    }
  });
  scene.add(spinner);
  ambient.spinner = spinner;

  const count = 80;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions.set([Math.cos(index) * 1.0, 0.4 + Math.random() * 1.6, -0.9 + Math.sin(index) * 1.0], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const fountain = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(fountain);
  ambient.fountain = fountain;

  const banner = createBannerMesh(sceneTitle, sceneSubtitle);
  banner.position.set(0, 0.03, 2.3);
  scene.add(banner);
}

function updateAmbient(ambient: Ambient, elapsed: number, delta: number) {
  ambient.clouds.forEach((cloud) => {
    cloud.position.y = (cloud.userData.baseY as number) + Math.sin(elapsed * 0.4 + (cloud.userData.phase as number)) * 0.4;
    cloud.position.x += delta * 0.15;
    if (cloud.position.x > 24) {
      cloud.position.x = -24;
    }
  });
  if (ambient.spinner) {
    ambient.spinner.rotation.y += delta * 0.5;
    ambient.spinner.position.y = 0.95 + Math.sin(elapsed * 1.6) * 0.08;
  }
  if (ambient.beacon) {
    const material = (ambient.beacon as THREE.Mesh).material as THREE.MeshBasicMaterial;
    material.color.setHSL(0.95, 1, 0.45 + Math.max(0, Math.sin(elapsed * 4)) * 0.3);
  }
  if (ambient.fountain) {
    const attribute = ambient.fountain.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let index = 0; index < array.length; index += 3) {
      array[index + 1] += delta * 0.9;
      if (array[index + 1] > 2.1) {
        array[index + 1] = 0.4;
      }
    }
    attribute.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* Pawn & movement                                                     */
/* ------------------------------------------------------------------ */

function createPawnMesh(option: PawnOption) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const material = new THREE.MeshPhysicalMaterial({
    color: option.color,
    roughness: 0.2,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    emissive: option.color,
    emissiveIntensity: 0.08,
  });
  const trim = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 });
  const profile = [
    [0, 0],
    [0.3, 0],
    [0.31, 0.04],
    [0.27, 0.08],
    [0.2, 0.11],
    [0.13, 0.2],
    [0.095, 0.36],
    [0.15, 0.4],
    [0.15, 0.43],
    [0.06, 0.46],
    [0, 0.46],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const stem = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), material);
  stem.castShadow = true;
  body.add(stem);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 10, 48), trim);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.04;
  body.add(band);

  let head: THREE.Mesh;
  if (option.key === "spark") {
    head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), material);
    head.position.y = 0.6;
  } else if (option.key === "anchor") {
    head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.2, 32), material);
    head.position.y = 0.56;
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 10, 40), trim);
    brim.rotation.x = Math.PI / 2;
    brim.position.y = 0.66;
    body.add(brim);
  } else if (option.key === "prism") {
    head = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), material);
    head.scale.set(1, 1.45, 1);
    head.position.y = 0.67;
  } else {
    head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 24), material);
    head.position.y = 0.6;
  }
  head.castShadow = true;
  body.add(head);

  // Eyes give the piece some personality.
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x1c1633 });
  [-0.06, 0.06].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), eyeMaterial);
    eye.scale.set(1, 1.4, 0.6);
    eye.position.set(x, head.position.y + 0.02, 0.16);
    body.add(eye);
  });

  group.scale.setScalar(1.55);
  return group;
}

interface HopState {
  queue: number[];
  current: { from: number; to: number; start: number } | null;
  nodeId: number;
  stepCount: number;
  stepsAfter: number;
  onHop: (step: number) => void;
  onLand: (nodeId: number) => void;
}

function updateHop(state: SceneState, now: number, reducedMotion: boolean) {
  const hop = state.hop;
  if (!hop.current && hop.queue.length > 0) {
    const to = hop.queue.shift() as number;
    hop.current = { from: hop.nodeId, to, start: now };
    hop.stepCount += 1;
    hop.onHop(hop.stepCount);
  }
  if (!hop.current) {
    return false;
  }

  const t = Math.min(1, (now - hop.current.start) / (HOP_MS * 0.9));
  const from = state.nodes[hop.current.from];
  const to = state.nodes[hop.current.to];
  const eased = easeInOutSine(t);
  state.pawnGroup.position.set(
    THREE.MathUtils.lerp(from.x, to.x, eased),
    SPACE_Y + Math.sin(Math.PI * t) * (reducedMotion ? 0.15 : 0.85),
    THREE.MathUtils.lerp(from.z, to.z, eased),
  );
  state.pawnGroup.rotation.y = lerpAngle(state.pawnGroup.rotation.y, facingBetween(from, to), 0.3);
  const body = state.pawnGroup.children[0];
  const stretch = 1 + Math.sin(Math.PI * t) * 0.14;
  body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
  body.position.y = 0;

  if (t >= 1) {
    hop.nodeId = hop.current.to;
    hop.current = null;
    body.scale.set(1.18, 0.8, 1.18);
    state.effects.push({ kind: "squash", age: 0, life: 0.25, object: body });
    state.ring.position.set(to.x, SPACE_Y + 0.01, to.z);
    const space = state.spaceMeshes[to.id];
    if (space) {
      state.effects.push({ kind: "bounce", age: 0, life: 0.3, object: space });
    }
    if (hop.queue.length === 0 && hop.stepsAfter === 0) {
      hop.onLand(hop.nodeId);
      spawnBurst(state, to.x, to.z, toneMeta[to.tone].color);
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Step counter & junction arrows                                      */
/* ------------------------------------------------------------------ */

interface CounterSprite {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  value: number;
}

function createCounterSprite(): CounterSprite {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.renderOrder = 20;
  sprite.scale.set(0.9, 0.9, 1);
  sprite.visible = false;
  return { sprite, canvas, texture, value: -1 };
}

function drawCounter(counter: CounterSprite, value: number) {
  const ctx = counter.canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, 160, 160);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(80, 80, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#2f80ff";
  ctx.stroke();
  ctx.fillStyle = "#1d3f9e";
  ctx.font = `900 92px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), 80, 86);
  counter.texture.needsUpdate = true;
  counter.value = value;
}

function updateCounter(state: SceneState, elapsed: number) {
  const hop = state.hop;
  const remaining = hop.queue.length + (hop.current ? 1 : 0) + hop.stepsAfter;
  state.counter.sprite.visible = remaining > 0;
  if (remaining <= 0) {
    return;
  }
  if (remaining !== state.counter.value) {
    drawCounter(state.counter, remaining);
  }
  const position = state.pawnGroup.position;
  state.counter.sprite.position.set(position.x, position.y + 2.0 + Math.sin(elapsed * 6) * 0.04, position.z);
}

function createJunctionArrow(color: number) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.55);
  shape.lineTo(0.42, 0.05);
  shape.lineTo(0.17, 0.05);
  shape.lineTo(0.17, -0.45);
  shape.lineTo(-0.17, -0.45);
  shape.lineTo(-0.17, 0.05);
  shape.lineTo(-0.42, 0.05);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 });
  geometry.translate(0, 0, -0.07);
  geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.3 }));
  mesh.castShadow = true;
  group.add(mesh);
  // Generous invisible hit target for easy clicking.
  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ visible: false })));
  return group;
}

function updateArrows(state: SceneState, elapsed: number) {
  const from = state.nodes[state.hop.nodeId];
  state.arrows.forEach((arrow, index) => {
    const direction = arrow.userData.direction as THREE.Vector3;
    const pulse = Math.sin(elapsed * 6 + index) * 0.12;
    arrow.position.y = (arrow.userData.baseY as number) + Math.abs(Math.sin(elapsed * 3 + index)) * 0.25;
    arrow.position.x = from.x + direction.x * (1.15 + pulse);
    arrow.position.z = from.z + direction.z * (1.15 + pulse);
  });
}

/* ------------------------------------------------------------------ */
/* Floating dice                                                       */
/* ------------------------------------------------------------------ */

interface DieModel {
  group: THREE.Group;
  normals: THREE.Vector3[];
  values: number[];
  axis: THREE.Vector3;
  settleFrom: THREE.Quaternion;
  final: THREE.Quaternion;
}

interface FloatingDice {
  d6: DieModel;
  d20: DieModel;
  mode: "hidden" | "idle" | "rolling";
  start: number;
  value: DiceRoll | null;
  finalized: boolean;
  visible: number;
}

function createFloatingDice(scene: THREE.Scene): FloatingDice {
  const d6 = createD6();
  const d20 = createD20();
  scene.add(d6.group, d20.group);
  d6.group.scale.setScalar(0.001);
  d20.group.scale.setScalar(0.001);
  return { d6, d20, mode: "hidden", start: 0, value: null, finalized: false, visible: 0 };
}

const spinQuaternion = new THREE.Quaternion();

function updateDice(state: SceneState, now: number, delta: number, elapsed: number) {
  const rig = state.dice;
  const camera = state.camera;
  const pawn = state.pawnGroup.position;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();

  const targetVisible = rig.mode === "hidden" ? 0 : 1;
  rig.visible += (targetVisible - rig.visible) * Math.min(1, delta * 9);
  const pop = rig.mode === "rolling" ? 1 + Math.max(0, 1 - (now - rig.start) / 220) * 0.25 : 1;

  const dice = [
    { die: rig.d6, offset: -0.62 },
    { die: rig.d20, offset: 0.62 },
  ];
  dice.forEach(({ die, offset }, index) => {
    die.group.position.set(pawn.x + right.x * offset, SPACE_Y + 2.25 + Math.sin(elapsed * 2.4 + index) * 0.08, pawn.z + right.z * offset);
    die.group.scale.setScalar(Math.max(0.001, rig.visible * pop));
    die.group.visible = rig.visible > 0.02;
  });

  if (rig.mode === "idle") {
    dice.forEach(({ die }) => die.group.quaternion.multiply(spinQuaternion.setFromAxisAngle(die.axis, delta * 1.4)));
  } else if (rig.mode === "rolling" && rig.value) {
    const age = now - rig.start;
    if (age < SPIN_MS) {
      const speed = 16 * (1 - (age / SPIN_MS) * 0.4);
      dice.forEach(({ die }) => die.group.quaternion.multiply(spinQuaternion.setFromAxisAngle(die.axis, delta * speed)));
    } else {
      if (!rig.finalized) {
        rig.finalized = true;
        const value = rig.value;
        dice.forEach(({ die }) => {
          die.settleFrom.copy(die.group.quaternion);
          const target = die === rig.d6 ? value.d6 : value.d20;
          const index = Math.max(0, die.values.indexOf(target));
          const toCamera = camera.position.clone().sub(die.group.position).normalize();
          die.final.setFromUnitVectors(die.normals[index], toCamera);
        });
      }
      const t = Math.min(1, (age - SPIN_MS) / SETTLE_MS);
      const eased = Math.min(1, easeOutBack(t));
      dice.forEach(({ die }) => die.group.quaternion.slerpQuaternions(die.settleFrom, die.final, eased));
    }
  }
}

function createD6(): DieModel {
  const size = 0.62;
  const values = [3, 4, 1, 6, 2, 5];
  const materials = values.map((value) => new THREE.MeshPhysicalMaterial({ map: createPipTexture(value), roughness: 0.25, clearcoat: 1 }));
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 4, 0.1), materials);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  const normals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  return { group, normals, values, axis: new THREE.Vector3(0.6, 1, 0.3).normalize(), settleFrom: new THREE.Quaternion(), final: new THREE.Quaternion() };
}

function createD20(): DieModel {
  const radius = 0.44;
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize().multiplyScalar(radius));

  const faces: number[][] = [];
  const edge = raw[0].distanceTo(raw[1]);
  for (let a = 0; a < 12; a += 1) {
    for (let b = a + 1; b < 12; b += 1) {
      for (let c = b + 1; c < 12; c += 1) {
        const close = (i: number, j: number) => Math.abs(raw[i].distanceTo(raw[j]) - edge) < 1e-4;
        if (close(a, b) && close(b, c) && close(a, c)) {
          const normal = new THREE.Vector3().subVectors(raw[b], raw[a]).cross(new THREE.Vector3().subVectors(raw[c], raw[a]));
          const centroid = new THREE.Vector3().add(raw[a]).add(raw[b]).add(raw[c]);
          faces.push(normal.dot(centroid) > 0 ? [a, b, c] : [a, c, b]);
        }
      }
    }
  }
  const normals = faces.map((face) => new THREE.Vector3().add(raw[face[0]]).add(raw[face[1]]).add(raw[face[2]]).normalize());
  // Opposite faces sum to 21, like a real d20.
  const values = new Array<number>(faces.length).fill(0);
  let next = 1;
  normals.forEach((normal, index) => {
    if (values[index]) {
      return;
    }
    const opposite = normals.findIndex((other, otherIndex) => otherIndex !== index && other.dot(normal) < -0.999);
    values[index] = next;
    if (opposite >= 0) {
      values[opposite] = 21 - next;
    }
    next += 1;
  });

  const positions: number[] = [];
  const uvs: number[] = [];
  faces.forEach((face, index) => {
    face.forEach((vertex) => positions.push(raw[vertex].x, raw[vertex].y, raw[vertex].z));
    const u0 = (index % 5) / 5;
    const v0 = 1 - (Math.floor(index / 5) + 1) / 4;
    uvs.push(u0 + 0.1, v0 + 0.23, u0 + 0.012, v0 + 0.025, u0 + 0.188, v0 + 0.025);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ map: createD20Atlas(values), roughness: 0.2, clearcoat: 1, flatShading: true }));
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, normals, values, axis: new THREE.Vector3(-0.4, 1, 0.5).normalize(), settleFrom: new THREE.Quaternion(), final: new THREE.Quaternion() };
}

/* ------------------------------------------------------------------ */
/* Card decks                                                          */
/* ------------------------------------------------------------------ */

interface DeckRig {
  top: THREE.Mesh;
  drawStart: number;
  base: THREE.Vector3;
  rotation: number;
}

function createDeck(scene: THREE.Scene, kind: "prompt" | "inject", anisotropy: number): DeckRig {
  const slot = DECK_SLOTS[kind];
  const back = new THREE.CanvasTexture(drawCardBack(kind));
  back.colorSpace = THREE.SRGBColorSpace;
  back.anisotropy = anisotropy;
  const edge = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.8 });
  const materials = [edge, edge, new THREE.MeshStandardMaterial({ map: back, roughness: 0.5 }), edge, edge, edge];
  const box = new THREE.BoxGeometry(0.98, 0.03, 1.32);

  const pedestal = new THREE.Mesh(
    new RoundedBoxGeometry(1.3, 0.2, 1.65, 3, 0.08),
    new THREE.MeshStandardMaterial({ color: kind === "prompt" ? 0x8ee6c9 : 0xffb58a, roughness: 0.45 }),
  );
  pedestal.position.set(slot.x, 0.1, slot.z);
  pedestal.rotation.y = slot.rotation;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const stack = new THREE.Group();
  stack.position.set(slot.x, 0.2, slot.z);
  stack.rotation.y = slot.rotation;
  for (let index = 0; index < 8; index += 1) {
    const card = new THREE.Mesh(box, materials);
    card.position.set(Math.sin(index * 2.1) * 0.015, 0.015 + index * 0.031, Math.cos(index * 1.7) * 0.015);
    card.rotation.y = Math.sin(index * 3.3) * 0.03;
    card.castShadow = true;
    stack.add(card);
  }
  scene.add(stack);

  const top = new THREE.Mesh(box, materials);
  top.visible = false;
  top.castShadow = true;
  scene.add(top);
  return { top, drawStart: 0, base: new THREE.Vector3(slot.x, 0.2 + 0.015 + 8 * 0.031, slot.z), rotation: slot.rotation };
}

function updateDecks(decks: Record<"prompt" | "inject", DeckRig>, now: number) {
  (Object.values(decks) as DeckRig[]).forEach((deck) => {
    if (!deck.drawStart) {
      return;
    }
    const t = (now - deck.drawStart) / 1100;
    if (t >= 1) {
      deck.top.visible = false;
      deck.drawStart = 0;
      return;
    }
    deck.top.visible = true;
    const lift = easeOutCubic(Math.min(1, t * 2.2));
    const fly = easeInCubic(Math.max(0, (t - 0.45) / 0.55));
    deck.top.position.set(deck.base.x, deck.base.y + lift * 1.3 + fly * 3, deck.base.z + fly * 3);
    deck.top.rotation.set(-fly * 0.9, deck.rotation * (1 - lift), Math.PI * Math.min(1, t * 1.8));
    deck.top.scale.setScalar(1 + lift * 0.3 - fly * 0.7);
  });
}

function drawCardBack(kind: "prompt" | "inject") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 690;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const primary = kind === "prompt" ? "#2fbf8f" : "#ff7a3d";
  const secondary = kind === "prompt" ? "#1a8a7a" : "#d6452c";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 512, 690);
  const gradient = ctx.createLinearGradient(0, 0, 512, 690);
  gradient.addColorStop(0, primary);
  gradient.addColorStop(1, secondary);
  ctx.fillStyle = gradient;
  roundRect(ctx, 22, 22, 468, 646, 34);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let y = 0; y < 690; y += 60) {
    for (let x = (y / 60) % 2 === 0 ? 0 : 30; x < 512; x += 60) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(256, 300, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = secondary;
  ctx.font = `900 170px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(kind === "prompt" ? "?" : "!", 256, 310);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 58px ${FONT}`;
  setLetterSpacing(ctx, "6px");
  ctx.fillText(kind === "prompt" ? "PROMPT" : "TWIST", 256, 520);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

type Effect =
  | { kind: "ring"; age: number; life: number; object: THREE.Mesh }
  | { kind: "sparks"; age: number; life: number; object: THREE.Points; velocities: Float32Array }
  | { kind: "squash"; age: number; life: number; object: THREE.Object3D }
  | { kind: "bounce"; age: number; life: number; object: THREE.Object3D };

function spawnBurst(state: SceneState, x: number, z: number, color: string | number = 0xffd34d) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.58, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, SPACE_Y + 0.03, z);
  state.scene.add(ring);
  state.effects.push({ kind: "ring", age: 0, life: 0.7, object: ring });

  const count = 40;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 1.8;
    positions.set([x, SPACE_Y + 0.2, z], index * 3);
    velocities.set([Math.cos(angle) * speed, 2 + Math.random() * 2.5, Math.sin(angle) * speed], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const sparks = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.12, transparent: true, depthWrite: false }));
  state.scene.add(sparks);
  state.effects.push({ kind: "sparks", age: 0, life: 0.95, object: sparks, velocities });
}

function updateEffects(state: SceneState, delta: number) {
  state.effects = state.effects.filter((effect) => {
    effect.age += delta;
    const t = Math.min(1, effect.age / effect.life);
    if (effect.kind === "ring") {
      effect.object.scale.setScalar(1 + easeOutCubic(t) * 2.4);
      (effect.object.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    } else if (effect.kind === "sparks") {
      const attribute = effect.object.geometry.getAttribute("position") as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let index = 0; index < array.length; index += 3) {
        effect.velocities[index + 1] -= 8 * delta;
        array[index] += effect.velocities[index] * delta;
        array[index + 1] = Math.max(SPACE_Y + 0.05, array[index + 1] + effect.velocities[index + 1] * delta);
        array[index + 2] += effect.velocities[index + 2] * delta;
      }
      attribute.needsUpdate = true;
      (effect.object.material as THREE.PointsMaterial).opacity = 1 - t;
    } else if (effect.kind === "squash") {
      const k = easeOutBack(t);
      const sx = THREE.MathUtils.lerp(1.18, 1, k);
      effect.object.scale.set(sx, THREE.MathUtils.lerp(0.8, 1, k), sx);
    } else {
      effect.object.position.y = SPACE_Y - 0.07 - Math.sin(Math.PI * t) * 0.06;
    }

    if (t >= 1) {
      if (effect.kind === "ring" || effect.kind === "sparks") {
        state.scene.remove(effect.object);
        disposeObject(effect.object);
      } else if (effect.kind === "squash") {
        effect.object.scale.set(1, 1, 1);
      } else {
        effect.object.position.y = SPACE_Y - 0.07;
      }
      return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */

function createSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#7cc8ff");
    gradient.addColorStop(0.55, "#bfe3ff");
    gradient.addColorStop(1, "#ead9ff");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 16, 512);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPlazaTexture() {
  const width = 2048;
  const height = Math.round(width * (16 / 23));
  const unit = width / 23;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Lawn border with flowers.
    ctx.fillStyle = "#c9efd2";
    ctx.fillRect(0, 0, width, height);
    for (let index = 0; index < 320; index += 1) {
      ctx.fillStyle = ["#ffffff", "#ff9ec7", "#ffd86b"][index % 3];
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Checkered plaza.
    ctx.save();
    roundRect(ctx, 70, 70, width - 140, height - 140, 120);
    ctx.clip();
    ctx.fillStyle = "#f9dbe8";
    ctx.fillRect(0, 0, width, height);
    const tile = 64;
    ctx.fillStyle = "#f3cadd";
    for (let y = 0; y < height; y += tile) {
      for (let x = 0; x < width; x += tile) {
        if ((x / tile + y / tile) % 2 === 0) {
          ctx.fillRect(x, y, tile, tile);
        }
      }
    }
    ctx.restore();
    // Central fountain plaza.
    ctx.fillStyle = "#fff4d6";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2 - 0.9 * unit, 3.3 * unit, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffc857";
    ctx.lineWidth = 10;
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createSpaceTexture(tone: BoardSpaceTone, isStart: boolean) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const color = isStart ? "#ffb21e" : toneMeta[tone].color;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const gradient = ctx.createRadialGradient(size * 0.4, size * 0.35, 10, size / 2, size / 2, size * 0.45);
    gradient.addColorStop(0, shade(color, 0.16));
    gradient.addColorStop(1, shade(color, -0.06));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    if (isStart) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `900 58px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("START", size / 2, size / 2 + 4);
    } else {
      drawGlyph(ctx, tone, size / 2, size / 2, size * 0.42, "#ffffff");
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawGlyph(ctx: CanvasRenderingContext2D, tone: BoardSpaceTone, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(5, size * 0.1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (tone) {
    case "start":
    case "business": {
      // A person: stakeholders.
      ctx.beginPath();
      ctx.arc(0, -s * 0.3, s * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, s * 0.55, s * 0.5, Math.PI, 0);
      ctx.fill();
      break;
    }
    case "triage": {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.7);
      ctx.lineTo(s * 0.72, s * 0.55);
      ctx.lineTo(-s * 0.72, s * 0.55);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.2);
      ctx.lineTo(0, s * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, s * 0.35, ctx.lineWidth * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "decision": {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.72);
      ctx.lineTo(s * 0.72, 0);
      ctx.lineTo(0, s * 0.72);
      ctx.lineTo(-s * 0.72, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, 0);
      ctx.lineTo(-s * 0.05, s * 0.25);
      ctx.lineTo(s * 0.32, -s * 0.2);
      ctx.stroke();
      break;
    }
    case "technical": {
      roundRect(ctx, -s * 0.45, -s * 0.45, s * 0.9, s * 0.9, s * 0.12);
      ctx.stroke();
      for (let pin = -1; pin <= 1; pin += 1) {
        const p = pin * s * 0.25;
        ctx.beginPath();
        ctx.moveTo(p, -s * 0.45);
        ctx.lineTo(p, -s * 0.72);
        ctx.moveTo(p, s * 0.45);
        ctx.lineTo(p, s * 0.72);
        ctx.moveTo(-s * 0.45, p);
        ctx.lineTo(-s * 0.72, p);
        ctx.moveTo(s * 0.45, p);
        ctx.lineTo(s * 0.72, p);
        ctx.stroke();
      }
      break;
    }
    case "recovery": {
      ctx.lineWidth = size * 0.16;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.6);
      ctx.lineTo(0, s * 0.6);
      ctx.moveTo(-s * 0.6, 0);
      ctx.lineTo(s * 0.6, 0);
      ctx.stroke();
      break;
    }
    case "gap": {
      ctx.lineWidth = size * 0.16;
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, 0);
      ctx.lineTo(s * 0.6, 0);
      ctx.stroke();
      break;
    }
    case "inject": {
      ctx.beginPath();
      ctx.moveTo(s * 0.12, -s * 0.78);
      ctx.lineTo(-s * 0.45, s * 0.1);
      ctx.lineTo(-s * 0.02, s * 0.1);
      ctx.lineTo(-s * 0.15, s * 0.78);
      ctx.lineTo(s * 0.45, -s * 0.12);
      ctx.lineTo(s * 0.02, -s * 0.12);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function createBannerMesh(title: string, subtitle: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 8, 8, 1008, 240, 120);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#ff6fa8";
    ctx.stroke();
    ctx.fillStyle = "#3a2a7a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 60px ${FONT}`;
    let label = title.toUpperCase();
    while (ctx.measureText(label).width > 920 && label.length > 6) {
      label = `${label.slice(0, -2)}…`;
    }
    ctx.fillText(label, 512, 104);
    ctx.fillStyle = "#8a6fd6";
    ctx.font = `700 32px ${FONT}`;
    setLetterSpacing(ctx, "2px");
    ctx.fillText(subtitle.toUpperCase(), 512, 178);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function createWindowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        ctx.fillStyle = (row + col) % 3 === 0 ? "rgba(255,246,190,0.95)" : "rgba(120,170,230,0.85)";
        roundRect(ctx, 12 + col * 60, 12 + row * 58, 48, 46, 10);
        ctx.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRadialTexture(inner: string, outer: string, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPipTexture(value: number) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const spots: Record<number, Array<[number, number]>> = {
      1: [[0.5, 0.5]],
      2: [[0.27, 0.27], [0.73, 0.73]],
      3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
      4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
      5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
      6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
    };
    spots[value].forEach(([x, y]) => {
      ctx.fillStyle = value === 1 ? "#ff3d6e" : "#2f60e0";
      ctx.beginPath();
      ctx.arc(x * size, y * size, value === 1 ? 36 : 25, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createD20Atlas(values: number[]) {
  const cell = 256;
  const canvas = document.createElement("canvas");
  canvas.width = cell * 5;
  canvas.height = cell * 4;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffb627";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    values.forEach((value, index) => {
      const x0 = (index % 5) * cell;
      const y0 = Math.floor(index / 5) * cell;
      const apex = [x0 + cell / 2, y0 + cell * 0.08];
      const left = [x0 + cell * 0.06, y0 + cell * 0.9];
      const right = [x0 + cell * 0.94, y0 + cell * 0.9];
      ctx.fillStyle = value >= 15 ? "#ff8a3d" : "#ffc94a";
      ctx.beginPath();
      ctx.moveTo(apex[0], apex[1]);
      ctx.lineTo(left[0], left[1]);
      ctx.lineTo(right[0], right[1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 6;
      ctx.stroke();
      const cx = (apex[0] + left[0] + right[0]) / 3;
      const cy = (apex[1] + left[1] + right[1]) / 3 + 6;
      ctx.fillStyle = "#5a2a00";
      ctx.font = `900 ${value >= 10 ? 74 : 86}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), cx, cy);
      if (value === 6 || value === 9) {
        ctx.fillRect(cx - 20, cy + 42, 40, 7);
      }
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

interface CameraTween {
  start: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
}

function facingBetween(from: { x: number; z: number }, to: { x: number; z: number }) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in spaced) {
    spaced.letterSpacing = value;
  }
}

function shade(hex: string, amount: number) {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return `#${color.getHexString()}`;
}

function lerpAngle(from: number, to: number, t: number) {
  let difference = to - from;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return from + difference * t;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInCubic(value: number) {
  return value * value * value;
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeInOutSine(value: number) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function easeOutBack(value: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Sprite || child instanceof THREE.LineSegments) {
      // Sprites share one module-level geometry in three.js, so never dispose it.
      if (!(child instanceof THREE.Sprite)) {
        child.geometry?.dispose();
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material: THREE.Material) => {
        (material as THREE.Material & { map?: THREE.Texture | null }).map?.dispose();
        material.dispose();
      });
    }
  });
}
