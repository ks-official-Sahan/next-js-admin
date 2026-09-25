"use client";
import React from "react";
import Wave from "react-wavify";
import { useAudio } from "@/context/AudioContext";

const FloatingAudioSwitch = () => {
  const { isPlaying, toggleAudio } = useAudio(); // Get audio state and actions from context

  return (
    <div className="fixed bottom-8 right-10 z-[2000]">
      <div className="flex items-center gap-4">
        <div className="text-[12px] font-medium opacity-80 ">
          AUDIO{" "}
          <span className="text-lime-500">{isPlaying ? "ON" : "OFF"}</span>
        </div>
        <button
          type="button"
          onClick={toggleAudio}
          aria-label={isPlaying ? "Pause background audio" : "Play background audio"}
          aria-pressed={isPlaying}
          className="cursor-pointer relative rounded-full overflow-hidden border backdrop-blur-sm hover:shadow-[inset_0_0_8px_4px_rgba(132,204,22,0.4)] hover:border-lime-500 hover:scale-[98%] transition-shadow duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500"
        >
          {/* Inner glow: pulses from CSS (.audio-glow) while playing */}
          <div
            data-playing={isPlaying}
            className="audio-glow absolute inset-0 rounded-full"
            style={{
              backgroundColor: isPlaying ? "rgba(132,204,22,0.4)" : "",
            }}
          />
          <Wave
            fill="#84cc16"
            paused={!isPlaying}
            style={{
              display: "flex",
              width: 40,
              height: 40,
              borderRadius: 100,
            }}
            options={{
              amplitude: 15,
              speed: 0.3,
              points: 3,
            }}
          />
        </button>
      </div>
    </div>
  );
};

export default FloatingAudioSwitch;
