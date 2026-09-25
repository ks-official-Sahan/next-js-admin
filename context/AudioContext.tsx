"use client";
import { createContext, useState, useContext, useEffect, useRef } from "react";

type AudioContextType = {
  isPlaying: boolean;
  toggleAudio: () => void;
  bgSound: HTMLAudioElement | null;
};

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider = ({ children }: { children: React.ReactNode }) => {
  const [bgSound] = useState<HTMLAudioElement | null>(() => {
    if (typeof window === "undefined") return null;
    const audio = new Audio("/aud/cts.mp3");
    audio.loop = true;
    audio.volume = 0.2;
    return audio;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Restore playback state from localStorage and wire up play/pause listeners.
  useEffect(() => {
    if (!bgSound) return;
    const audio = bgSound;

    const savedIsPlaying = localStorage.getItem("isPlaying");
    const savedCurrentTime = localStorage.getItem("currentTime");

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    if (savedIsPlaying === "true") {
      const time = savedCurrentTime ? parseFloat(savedCurrentTime) : 0;
      audio.currentTime = time;

      // Attempt to play the audio and handle case where it doesn't work
      audio.play().catch(() => {
        // If the audio fails to play (e.g., due to browser restrictions), set the state to false
        setIsPlaying(false);
        localStorage.setItem("isPlaying", "false");
      });
    }

    return () => {
      // Store the current time and play state before unmounting
      localStorage.setItem("currentTime", audio.currentTime.toString());
      localStorage.setItem("isPlaying", isPlayingRef.current.toString());
      audio.pause();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [bgSound]);

  // Store the currentTime in localStorage whenever audio time updates
  useEffect(() => {
    if (bgSound) {
      const handleTimeUpdate = () => {
        localStorage.setItem("currentTime", bgSound.currentTime.toString());
      };
      bgSound.addEventListener("timeupdate", handleTimeUpdate);

      return () => {
        bgSound.removeEventListener("timeupdate", handleTimeUpdate);
      };
    }
  }, [bgSound]);

  const toggleAudio = () => {
    if (bgSound) {
      if (isPlaying) {
        bgSound.pause();
        localStorage.setItem("isPlaying", "false");
      } else {
        bgSound.play().catch(() => {
          // Handle case where audio fails to play
        });
        localStorage.setItem("isPlaying", "true");
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <AudioContext.Provider value={{ isPlaying, toggleAudio, bgSound }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};
