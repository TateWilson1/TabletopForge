"use client";

import { useEffect, useRef, useState } from "react";
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { boardSpaceCount, boardSpaceLabels, pawnOptions, type PawnKey, type PawnOption } from "@/components/tabletop-board-config";

export function TabletopBoardScene({
  pawn,
  positionIndex,
  rollNonce,
  rollResult,
  isRolling,
}: {
  pawn: PawnKey;
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
    diceMesh: THREE.Mesh;
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
    mountElement.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b111c, 7, 18);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 7.2, 11.8);
    camera.lookAt(0, 0, 0);

    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    world.broadphase = new CANNON.SAPBroadphase(world);

    const ambient = new THREE.AmbientLight(0xffffff, 0.68);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(3, 7, 5);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x23d39b, 0.9, 9);
    fillLight.position.set(-3.6, 2.6, -2.6);
    scene.add(fillLight);

    const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3a24, roughness: 0.72 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.35, 5.8), tableMaterial);
    table.position.y = -0.28;
    scene.add(table);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 0.12, 4.5),
      new THREE.MeshStandardMaterial({ color: 0x102b28, roughness: 0.86, metalness: 0.05 }),
    );
    board.position.y = 0;
    scene.add(board);

    addBoardSpaces(scene);
    addCardDecks(scene);

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(4.3, 0.08, 2.9)) });
    groundBody.position.set(0, 0.12, 0);
    world.addBody(groundBody);

    const diceMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.38, 0),
      new THREE.MeshStandardMaterial({ color: 0xf5b83d, roughness: 0.42, metalness: 0.18 }),
    );
    diceMesh.position.set(0, 0.9, 0);
    scene.add(diceMesh);

    const diceBody = new CANNON.Body({ mass: 1.2, shape: new CANNON.Sphere(0.38), linearDamping: 0.34, angularDamping: 0.28 });
    diceBody.position.set(0, 0.9, 0);
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
      const cameraStart = new THREE.Vector3(0, 7.2, 11.8);
      const cameraTarget = new THREE.Vector3(4.8, 5.6, 7.2);
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
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      mountElement.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

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

    state.pawnTarget.copy(getBoardPosition(positionIndex % boardSpaceCount).clone().setY(0.48));
  }, [positionIndex]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state || rollNonce === 0) {
      return;
    }

    const push = 3.2 + (rollResult % 5) * 0.3;
    state.diceBody.position.set(-1.6, 1.2, -0.4);
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
  const positions = [
    [-2.7, 0, 1.65],
    [-0.9, 0, 1.65],
    [0.9, 0, 1.65],
    [2.7, 0, 1.65],
    [2.7, 0, 0.55],
    [2.7, 0, -0.55],
    [2.7, 0, -1.65],
    [0.9, 0, -1.65],
    [-0.9, 0, -1.65],
    [-2.7, 0, -1.65],
    [-2.7, 0, -0.55],
    [-2.7, 0, 0.55],
  ];
  const [x, y, z] = positions[index % positions.length];
  return new THREE.Vector3(x, y, z);
}

function addBoardSpaces(scene: THREE.Scene) {
  const tileGeometry = new THREE.BoxGeometry(1.22, 0.08, 0.72);
  for (let index = 0; index < boardSpaceCount; index += 1) {
    const isCorner = [0, 3, 6, 9].includes(index);
    const isInject = boardSpaceLabels[index] === "Twist";
    const material = new THREE.MeshStandardMaterial({
      color: isInject ? 0x7c2d12 : isCorner ? 0x0f766e : 0x172554,
      roughness: 0.72,
      metalness: 0.02,
    });
    const tile = new THREE.Mesh(tileGeometry, material);
    tile.position.copy(getBoardPosition(index));
    tile.position.y = 0.13;
    scene.add(tile);

    const label = createLabelMesh(boardSpaceLabels[index], isInject ? "#fbbf24" : "#d8fff1");
    label.position.copy(tile.position);
    label.position.y = 0.18;
    label.rotation.x = -Math.PI / 2;
    scene.add(label);
  }
}

function addCardDecks(scene: THREE.Scene) {
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x13251f, roughness: 0.66 });
  const injectMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2814, roughness: 0.66 });

  for (let index = 0; index < 4; index += 1) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.035, 1.16), deckMaterial);
    card.position.set(-0.95 + index * 0.035, 0.22 + index * 0.018, 0);
    card.rotation.y = 0.1;
    scene.add(card);
  }

  for (let index = 0; index < 3; index += 1) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.035, 1.16), injectMaterial);
    card.position.set(0.98 + index * 0.035, 0.22 + index * 0.018, 0);
    card.rotation.y = -0.12;
    scene.add(card);
  }
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

function createLabelMesh(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(6, 12, 20, 0.72)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(35, 211, 155, 0.52)";
    context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    context.fillStyle = color;
    context.font = "bold 22px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  return new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.34), material);
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
