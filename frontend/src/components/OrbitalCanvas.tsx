"use client";

import { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Line } from "@react-three/drei";
import * as THREE from "three";
import type { AsteroidItem } from "./SentinelPanel";

/* ── constants ───────────────────────────────────────────────────────────── */
// 1 unit = 1 lunar distance (384,400 km)
const LUNAR_DISTANCE_KM = 384_400;
const EARTH_RADIUS = 0.18;

/* ── Earth ───────────────────────────────────────────────────────────────── */
function Earth() {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.08;
  });
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[EARTH_RADIUS, 32, 32]} />
      <meshStandardMaterial color="#1a6fa8" emissive="#0a2a44" roughness={0.8} />
    </mesh>
  );
}

/* ── Atmosphere glow ─────────────────────────────────────────────────────── */
function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[EARTH_RADIUS * 1.08, 32, 32]} />
      <meshStandardMaterial
        color="#38bdf8"
        transparent
        opacity={0.07}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

/* ── Orbital reference ring ──────────────────────────────────────────────── */
function OrbitalGrid() {
  const points: [number, number, number][] = [];
  const segments = 128;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    points.push([Math.cos(theta) * 2.5, 0, Math.sin(theta) * 2.5]);
  }
  return (
    <Line
      points={points}
      color="#38bdf8"
      lineWidth={0.4}
      transparent
      opacity={0.12}
    />
  );
}

/* ── Single asteroid trajectory ──────────────────────────────────────────── */
interface TrajectoryProps {
  item: AsteroidItem;
  index: number;
  total: number;
}

function AsteroidTrajectory({ item, index, total }: TrajectoryProps) {
  const missDistLd = (item.miss_distance_km ?? LUNAR_DISTANCE_KM) / LUNAR_DISTANCE_KM;
  const clampedDist = Math.max(0.3, Math.min(missDistLd, 6));

  // Spread asteroids evenly around the orbital plane
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const approachX = Math.cos(angle) * clampedDist;
  const approachZ = Math.sin(angle) * clampedDist;

  // Inbound arc: from 5 LD out toward closest approach point
  const inboundX = Math.cos(angle) * 5;
  const inboundZ = Math.sin(angle) * 5;

  // Bezier-style arc via midpoint slightly above the ecliptic
  const midX = (inboundX + approachX) / 2;
  const midY = 0.4;
  const midZ = (inboundZ + approachZ) / 2;

  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(inboundX, 0, inboundZ),
    new THREE.Vector3(midX, midY, midZ),
    new THREE.Vector3(approachX, 0, approachZ)
  );
  const arcPoints = curve.getPoints(40).map(
    (p) => [p.x, p.y, p.z] as [number, number, number]
  );

  const isHazardous = item.is_potentially_hazardous;
  const color = isHazardous ? "#f87171" : "#38bdf8";

  // Scale node size logarithmically by diameter
  const diamKm = item.estimated_diameter_km_max ?? 0.1;
  const nodeSize = Math.max(0.02, Math.min(0.07, Math.log10(diamKm + 1) * 0.04));

  return (
    <group>
      {/* Trajectory arc */}
      <Line
        points={arcPoints}
        color={color}
        lineWidth={isHazardous ? 1.2 : 0.7}
        transparent
        opacity={isHazardous ? 0.85 : 0.5}
      />
      {/* Closest approach node */}
      <mesh position={[approachX, 0, approachZ]}>
        <sphereGeometry args={[nodeSize, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isHazardous ? 1.2 : 0.6}
        />
      </mesh>
    </group>
  );
}

/* ── Scene ───────────────────────────────────────────────────────────────── */
function Scene({ items }: { items: AsteroidItem[] }) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[6, 4, 6]} intensity={1.2} color="#fff9f0" />
      <Stars radius={80} depth={50} count={3000} factor={3} fade speed={0.4} />
      <OrbitalGrid />
      <Earth />
      <Atmosphere />
      {items.map((item, i) => (
        <AsteroidTrajectory key={i} item={item} index={i} total={items.length} />
      ))}
      <OrbitControls
        enablePan={false}
        minDistance={0.6}
        maxDistance={9}
        autoRotate
        autoRotateSpeed={0.4}
      />
    </>
  );
}

/* ── Public component ────────────────────────────────────────────────────── */
interface OrbitalCanvasProps {
  items: AsteroidItem[];
}

export default function OrbitalCanvas({ items }: OrbitalCanvasProps) {
  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{ height: 220, minHeight: 220, background: "rgba(4,9,15,0.7)", border: "1px solid var(--border)" }}
    >
      <Canvas
        frameloop="demand"
        camera={{ position: [0, 3.5, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <Scene items={items} />
        </Suspense>
      </Canvas>
      <style>{`
        canvas { display: block; }
      `}</style>
    </div>
  );
}
