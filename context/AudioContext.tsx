"use client";
import { createContext, useState, useContext, useEffect, useRef } from "react";

type AudioContextType = {
  isPlaying: boolean;
  toggleAudio: () => void;
  bgSound: HTMLAudioElement | null;
};

const AudioContext = createContext<AudioContextType | undefined>(undefined);

// Storage can throw (site data blocked, some private modes). The audio state
// is a nicety, and this provider wraps the whole site, so a storage failure
// must never break rendering.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted; playback itself is unaffected.
  }
}

/** timeupdate fires about four times a second; persist the position less often. */
const SAVE_POSITION_EVERY_MS = 5_000;

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

    const savedIsPlaying = readStorage("isPlaying");
    const savedCurrentTime = readStorage("currentTime");

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
        writeStorage("isPlaying", "false");
      });
    }

    return () => {
      // Store the current time and play state before unmounting
      writeStorage("currentTime", audio.currentTime.toString());
      writeStorage("isPlaying", isPlayingRef.current.toString());
      audio.pause();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [bgSound]);

  // Store the currentTime in localStorage whenever audio time updates
  useEffect(() => {
    if (bgSound) {
      let lastSaved = 0;
      const handleTimeUpdate = () => {
        const now = Date.now();
        if (now - lastSaved < SAVE_POSITION_EVERY_MS) return;
        lastSaved = now;
        writeStorage("currentTime", bgSound.currentTime.toString());
      };
      // Unmount cleanup does not run when the tab closes; pagehide does.
      const handlePageHide = () => writeStorage("currentTime", bgSound.currentTime.toString());
      bgSound.addEventListener("timeupdate", handleTimeUpdate);
      window.addEventListener("pagehide", handlePageHide);

      return () => {
        bgSound.removeEventListener("timeupdate", handleTimeUpdate);
        window.removeEventListener("pagehide", handlePageHide);
      };
    }
  }, [bgSound]);

  const toggleAudio = () => {
    if (bgSound) {
      if (isPlaying) {
        bgSound.pause();
        writeStorage("isPlaying", "false");
      } else {
        bgSound.play().catch(() => {
          // Handle case where audio fails to play
        });
        writeStorage("isPlaying", "true");
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
