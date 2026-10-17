import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Html,
  Stars,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { BossModel, FeedItem, Player } from "./types";

// ------------------------------------------------------------------
// Tweak these if a model looks too big/small, faces away, or floats.
// ------------------------------------------------------------------
const BOSS_Z = -2; // how far back the boss stands
const BOSSES: Record<
  BossModel,
  { file: string; height: number; rotY: number }
> = {
  // height = how tall the boss is drawn (scene units). rotY = turn it around (radians):
  // 0 = faces the camera, Math.PI = flip it 180 degrees.
  dragon: { file: "/models/dragon.glb", height: 4.8, rotY: 0 },
  orc: { file: "/models/orc.glb", height: 3.6, rotY: 0 },
  zombie: { file: "/models/zombie.glb", height: 3.2, rotY: 0 },
};
// Camera framing. Raise lookY to move everything lower on screen, lower it to move things up.
const CAM = { y: 3.4, z: 11.5, lookY: 0.8, fov: 45 };

type Vec3 = [number, number, number];
type Shot = {
  id: number;
  from: Vec3;
  hit: boolean;
  damage: number;
  mine: boolean;
};
type Num = { id: number; text: string; color: string; pos: Vec3 };

// ------------------------------------------------------------------ boss

// If a model file is missing or broken, show a placeholder instead of crashing the page.
class Boundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error("[boss] model failed to load", e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Placeholder() {
  return (
    <mesh position={[0, 1.8, BOSS_Z]}>
      <icosahedronGeometry args={[1.5, 1]} />
      <meshStandardMaterial color="#8a2323" wireframe />
    </mesh>
  );
}

function Boss({
  model,
  hitTick,
  dead,
  enraged,
}: {
  model: BossModel;
  hitTick: number;
  dead: boolean;
  enraged: boolean;
}) {
  const cfg = BOSSES[model];
  const gltf = useGLTF(cfg.file);
  const group = useRef<THREE.Group>(null);
  const flash = useRef(0);
  const jolt = useRef(0);
  const fall = useRef(0);
  const fallMode = useRef(false);

  // private copy of the model, scaled to a fixed height and standing on the floor
  const { root, scale, offset, mats } = useMemo(() => {
    const root = clone(gltf.scene);
    const mats: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
      for (const m of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.emissive.set("#ff2200");
          m.emissiveIntensity = 0;
          mats.push(m);
        }
      }
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = cfg.height / (size.y || 1);
    const offset = new THREE.Vector3(
      -center.x * scale,
      -box.min.y * scale,
      -center.z * scale,
    );
    return { root, scale, offset, mats };
  }, [gltf.scene, cfg.height]);

  const { actions, names, mixer } = useAnimations(gltf.animations, group);

  const idleName = useMemo(
    () =>
      names.find((n) => /idle|stand|breath|hover|fly/i.test(n)) ??
      names.find(
        (n) => !/death|die|dead|hit|hurt|damage|attack|bite|slash|punch/i.test(n),
      ) ??
      names[0],
    [names],
  );
  const hitName = names.find((n) => /hit|hurt|damage|react|flinch/i.test(n));
  const deathName = names.find((n) => /death|die|dead/i.test(n));

  // handy when a model behaves oddly: open the browser console (F12) to see its clips
  useEffect(() => {
    console.info(`[boss:${model}] animation clips:`, names);
  }, [model, names]);

  useEffect(() => {
    const idle = idleName ? actions[idleName] : null;
    idle?.reset().fadeIn(0.3).play();
    return () => {
      idle?.fadeOut(0.2);
    };
  }, [actions, idleName]);

  // after the hit reaction finishes, go back to idling
  useEffect(() => {
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (dead || !hitName || e.action !== actions[hitName]) return;
      const idle = idleName ? actions[idleName] : null;
      idle?.reset().fadeIn(0.2).play();
    };
    mixer.addEventListener("finished", onFinished);
    return () => mixer.removeEventListener("finished", onFinished);
  }, [mixer, actions, hitName, idleName, dead]);

  // got hit
  useEffect(() => {
    if (hitTick === 0 || dead) return;
    flash.current = 1;
    jolt.current = 1;
    const hit = hitName ? actions[hitName] : null;
    if (hit) {
      (idleName ? actions[idleName] : null)?.fadeOut(0.08);
      hit.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.08).play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitTick]);

  // died
  useEffect(() => {
    if (!dead) return;
    const death = deathName ? actions[deathName] : null;
    if (death) {
      (idleName ? actions[idleName] : null)?.fadeOut(0.2);
      (hitName ? actions[hitName] : null)?.fadeOut(0.1);
      death.reset().setLoop(THREE.LoopOnce, 1);
      death.clampWhenFinished = true;
      death.fadeIn(0.2).play();
    } else {
      fallMode.current = true; // no death clip: just topple over
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dead]);

  useFrame((_, dt) => {
    flash.current = Math.max(0, flash.current - dt * 3);
    jolt.current = Math.max(0, jolt.current - dt * 4);
    const glow = Math.max(flash.current, enraged && !dead ? 0.3 : 0);
    for (const m of mats) m.emissiveIntensity = glow;

    const g = group.current;
    if (!g) return;
    g.position.z = BOSS_Z - jolt.current * 0.35;
    if (fallMode.current) {
      fall.current = Math.min(1, fall.current + dt * 1.1);
      g.rotation.z = fall.current * 1.4;
      g.position.y = -fall.current * 0.3;
    }
  });

  return (
    <group ref={group} position={[0, 0, BOSS_Z]} rotation={[0, cfg.rotY, 0]}>
      <group scale={scale} position={offset}>
        <primitive object={root} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ party

function Hero({
  position,
  mine,
  name,
}: {
  position: Vec3;
  mine: boolean;
  name: string;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current)
      g.current.position.y =
        position[1] + Math.sin(clock.elapsedTime * 2 + position[0]) * 0.05;
  });
  return (
    <group ref={g} position={position}>
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.25, 0.55, 4, 10]} />
        <meshStandardMaterial color={mine ? "#3b82f6" : "#8b8fa3"} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#f1c9a5" />
      </mesh>
      <mesh position={[0.3, 0.9, 0.2]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshBasicMaterial color="#ff8a3d" />
      </mesh>
      <Html
        position={[0, 1.7, 0]}
        center
        zIndexRange={[5, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {mine ? "You" : name}
        </div>
      </Html>
    </group>
  );
}

// ------------------------------------------------------------------ effects

function Fireball({
  shot,
  target,
  onImpact,
}: {
  shot: Shot;
  target: THREE.Vector3;
  onImpact: (shot: Shot, at: THREE.Vector3) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const done = useRef(false);
  const from = useMemo(() => new THREE.Vector3(...shot.from), [shot]);
  const DURATION = 0.75; // seconds to reach the boss
  const END = shot.hit ? 1 : 0.55; // a missed shot fizzles out halfway

  useFrame((_, dt) => {
    if (done.current || !ref.current) return;
    t.current += dt / DURATION;
    const k = Math.min(t.current, END);
    const p = from.clone().lerp(target, k);
    p.y += Math.sin(k * Math.PI) * 1.2; // little arc
    ref.current.position.copy(p);
    ref.current.scale.setScalar(
      shot.hit ? 1 : Math.max(0.01, 1 - (k / END) ** 3),
    );
    if (t.current >= END) {
      done.current = true;
      onImpact(shot, p);
    }
  });

  return (
    <group ref={ref} position={shot.from}>
      <mesh>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshBasicMaterial color={shot.hit ? "#ffd27a" : "#9aa0aa"} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial
          color={shot.hit ? "#ff5a1f" : "#667"}
          transparent
          opacity={0.35}
        />
      </mesh>
    </group>
  );
}

function DamageNumber({
  num,
  onDone,
}: {
  num: Num;
  onDone: (id: number) => void;
}) {
  const g = useRef<THREE.Group>(null);
  const el = useRef<HTMLDivElement>(null);
  const age = useRef(0);
  const finished = useRef(false);

  useFrame((_, dt) => {
    age.current += dt;
    if (g.current) g.current.position.y = num.pos[1] + age.current * 1.1;
    if (el.current)
      el.current.style.opacity = String(Math.max(0, 1 - age.current / 1.3));
    if (age.current > 1.3 && !finished.current) {
      finished.current = true;
      onDone(num.id);
    }
  });

  return (
    <group ref={g} position={num.pos}>
      <Html center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
        <div
          ref={el}
          className="text-3xl font-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]"
          style={{ color: num.color }}
        >
          {num.text}
        </div>
      </Html>
    </group>
  );
}

function Torch({ position }: { position: Vec3 }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (light.current)
      light.current.intensity =
        22 + Math.sin(clock.elapsedTime * 11 + position[0]) * 4 + Math.random() * 2;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 1.8, 8]} />
        <meshStandardMaterial color="#3a2a1a" />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial color="#ff9a3c" />
      </mesh>
      <pointLight
        ref={light}
        position={[0, 2.1, 0]}
        color="#ff8a3a"
        intensity={22}
        distance={14}
      />
    </group>
  );
}

// moves the camera every frame: looks at the boss and applies the hit shake
function Rig({ shake }: { shake: React.RefObject<number> }) {
  useFrame(({ camera }, dt) => {
    const s = shake.current;
    camera.position.set(
      (Math.random() - 0.5) * s,
      CAM.y + (Math.random() - 0.5) * s,
      CAM.z,
    );
    camera.lookAt(0, CAM.lookY, 0);
    shake.current = Math.max(0, s - dt * 1.5);
  });
  return null;
}

// ------------------------------------------------------------------ scene

type Props = {
  model: BossModel;
  dead: boolean;
  enraged: boolean;
  feed: FeedItem[];
  players: Player[];
  myUid: string;
};

export default function BossScene({
  model,
  dead,
  enraged,
  feed,
  players,
  myUid,
}: Props) {
  const [hitTick, setHitTick] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [numbers, setNumbers] = useState<Num[]>([]);
  const shake = useRef(0);
  const seen = useRef(feed[0]?.id ?? 0); // ignore anything that happened before we mounted

  const target = useMemo(
    () => new THREE.Vector3(0, BOSSES[model].height * 0.55, BOSS_Z + 0.5),
    [model],
  );

  // party stands in an arc in front of the boss, in a stable order
  const slots = useMemo(() => {
    const sorted = [...players].sort((a, b) => a.uid.localeCompare(b.uid));
    const n = sorted.length;
    const spread = Math.min(9, 1.8 * (n - 1));
    const map = new Map<string, Vec3>();
    sorted.forEach((p, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      map.set(p.uid, [(t - 0.5) * spread, 0, 1.8 + Math.abs(t - 0.5) * 1.2]);
    });
    return { sorted, map };
  }, [players]);

  // every new damage event from the server becomes a fireball
  useEffect(() => {
    const fresh = feed.filter((f) => f.id > seen.current).reverse();
    if (fresh.length === 0) return;
    seen.current = fresh[fresh.length - 1].id;
    setShots((s) => [
      ...s,
      ...fresh.map((f) => {
        const p = slots.map.get(f.uid) ?? [0, 0, 2.5];
        return {
          id: f.id,
          from: [p[0] + 0.3, p[1] + 0.9, p[2] + 0.2] as Vec3,
          hit: f.correct,
          damage: f.damage,
          mine: f.uid === myUid,
        };
      }),
    ]);
  }, [feed, slots, myUid]);

  const onImpact = useCallback((shot: Shot, at: THREE.Vector3) => {
    setShots((s) => s.filter((x) => x.id !== shot.id));
    if (shot.hit) {
      setHitTick((t) => t + 1);
      shake.current = Math.min(0.5, 0.2 + shot.damage / 600);
    }
    setNumbers((n) => [
      ...n,
      {
        id: shot.id,
        text: shot.hit ? `-${shot.damage}` : "miss",
        color: shot.hit ? (shot.mine ? "#ffd166" : "#ff6b4a") : "#9aa0aa",
        pos: [at.x + (Math.random() - 0.5) * 0.6, at.y + 0.4, at.z + 0.3],
      },
    ]);
  }, []);

  const removeNumber = useCallback(
    (id: number) => setNumbers((n) => n.filter((x) => x.id !== id)),
    [],
  );

  return (
    <div className="isolate h-[340px] w-full overflow-hidden rounded-lg border bg-black md:h-[600px]">
      <Canvas
        camera={{ position: [0, CAM.y, CAM.z], fov: CAM.fov }}
        dpr={[1, 1.75]}
      >
        <color attach="background" args={["#0a0a12"]} />
        <fog attach="fog" args={["#0a0a12", 14, 34]} />
        <ambientLight intensity={0.7} />
        <hemisphereLight args={["#8899ff", "#221122", 0.6]} />
        <directionalLight position={[5, 9, 6]} intensity={1.6} />
        <Stars radius={60} depth={30} count={1200} factor={3} fade />

        {/* arena floor and a glowing ring under the boss */}
        <mesh rotation-x={-Math.PI / 2}>
          <circleGeometry args={[16, 64]} />
          <meshStandardMaterial color="#171722" roughness={1} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, BOSS_Z]}>
          <ringGeometry args={[4.2, 4.35, 64]} />
          <meshBasicMaterial color="#ff4d2e" />
        </mesh>
        <ContactShadows
          position={[0, 0.03, 0]}
          opacity={0.6}
          scale={22}
          blur={2.5}
          far={6}
        />
        <Torch position={[-6, 0, -1]} />
        <Torch position={[6, 0, -1]} />

        <Boundary fallback={<Placeholder />}>
          <Suspense fallback={<Placeholder />}>
            <Boss
              model={model}
              hitTick={hitTick}
              dead={dead}
              enraged={enraged}
            />
          </Suspense>
        </Boundary>

        {slots.sorted.map((p) => (
          <Hero
            key={p.uid}
            position={slots.map.get(p.uid) ?? [0, 0, 2.5]}
            mine={p.uid === myUid}
            name={p.name}
          />
        ))}

        {shots.map((s) => (
          <Fireball key={s.id} shot={s} target={target} onImpact={onImpact} />
        ))}
        {numbers.map((n) => (
          <DamageNumber key={n.id} num={n} onDone={removeNumber} />
        ))}

        <Rig shake={shake} />
      </Canvas>
    </div>
  );
}