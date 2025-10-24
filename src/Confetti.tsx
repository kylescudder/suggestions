// src/Confetti.tsx
import { useEffect, useState } from "react";

interface ConfettiPiece {
    id: number;
    x: number;
    y: number;
    rotation: number;
    color: string;
    size: number;
    velocityX: number;
    velocityY: number;
    rotationSpeed: number;
    borderRadius: string;
}

interface ConfettiProps {
    isActive: boolean;
    onComplete: () => void;
    durationMs?: number;
    count?: number; // total confetti pieces
}

export function Confetti({
                             isActive,
                             onComplete,
                             durationMs = 5000,
                             count = 300,
                         }: ConfettiProps) {
    const [confettiPieces, setConfettiPieces] = useState<ConfettiPiece[]>([]);

    const colors = [
        "#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57",
        "#ff9ff3", "#54a0ff", "#5f27cd", "#00d2d3", "#ff9f43",
        "#a55eea", "#26de81", "#fd79a8", "#fdcb6e", "#6c5ce7",
    ];

    useEffect(() => {
        if (!isActive) return;

        const gravity = 0.05;
        let spawnedCount = 0;
        let pieceId = 0;

        // Create confetti in intervals for a random drop effect
        const spawnInterval = setInterval(() => {
            const spawnBatchSize = Math.floor(Math.random() * 5) + 3; // 3–7 pieces per wave

            setConfettiPieces(prev => {
                const newPieces: ConfettiPiece[] = [];
                for (let i = 0; i < spawnBatchSize && spawnedCount < count; i++) {
                    newPieces.push({
                        id: pieceId++,
                        x: Math.random() * window.innerWidth,
                        y: -10,
                        rotation: Math.random() * 360,
                        color: colors[Math.floor(Math.random() * colors.length)],
                        size: Math.random() * 8 + 4,
                        velocityX: (Math.random() - 0.5) * 4,
                        velocityY: Math.random() * 2 + 1,
                        rotationSpeed: (Math.random() - 0.5) * 10,
                        borderRadius: Math.random() > 0.5 ? "50%" : "0%",
                    });
                    spawnedCount++;
                }
                return [...prev, ...newPieces];
            });

            if (spawnedCount >= count) {
                clearInterval(spawnInterval);
            }
        }, 100); // spawn new confetti every 100ms

        // Animation interval (gravity + motion)
        const animationInterval = setInterval(() => {
            setConfettiPieces(prevPieces => {
                const updatedPieces = prevPieces
                    .map(piece => ({
                        ...piece,
                        x: piece.x + piece.velocityX,
                        y: piece.y + piece.velocityY,
                        rotation: piece.rotation + piece.rotationSpeed,
                        velocityY: piece.velocityY + gravity,
                    }))
                    .filter(piece => piece.y < window.innerHeight + 20);

                if (updatedPieces.length === 0 && spawnedCount >= count) {
                    clearInterval(animationInterval);
                    clearInterval(spawnInterval);
                    setTimeout(onComplete, 500);
                }

                return updatedPieces;
            });
        }, 16); // 60 FPS

        // cleanup after duration
        const cleanup = setTimeout(() => {
            clearInterval(animationInterval);
            clearInterval(spawnInterval);
            setConfettiPieces([]);
            onComplete();
        }, durationMs);

        return () => {
            clearInterval(animationInterval);
            clearInterval(spawnInterval);
            clearTimeout(cleanup);
        };
    }, [isActive, onComplete, durationMs, count]);

    if (!isActive || confettiPieces.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            {confettiPieces.map(piece => (
                <div
                    key={piece.id}
                    className="absolute transition-transform"
                    style={{
                        left: `${piece.x}px`,
                        top: `${piece.y}px`,
                        width: `${piece.size}px`,
                        height: `${piece.size}px`,
                        backgroundColor: piece.color,
                        transform: `rotate(${piece.rotation}deg)`,
                        borderRadius: piece.borderRadius,
                    }}
                />
            ))}
        </div>
    );
}