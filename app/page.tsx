"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, MonitorPlay, MonitorOff, Maximize2 } from "lucide-react";

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(32).fill(0));
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const recognitionRef = useRef<any>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setIsSupported(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "id-ID"; // Indonesian, bisa diganti ke "en-US" untuk English

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcriptPart + " ";
          } else {
            interim += transcriptPart;
          }
        }

        if (final) {
          setTranscript((prev) => prev + final);
          // Reset countdown ketika ada text baru
          resetAutoClearTimer();
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        
        // Handle specific errors
        if (event.error === "not-allowed") {
          alert("Microphone access denied. Please allow microphone access.");
          setIsListening(false);
        } else if (event.error === "network") {
          console.log("Network error, will retry...");
          // Don't stop listening, let onend handle restart
        } else if (event.error === "no-speech") {
          console.log("No speech detected, continuing...");
          // This is normal, just continue
        } else if (event.error === "aborted") {
          console.log("Recognition aborted, will restart...");
          // Let onend handle restart
        } else {
          console.log("Recognition error, will retry:", event.error);
          // For other errors, try to continue
        }
      };

      recognition.onend = () => {
        console.log("Recognition ended, isListening:", isListening);
        // Auto-restart if still supposed to be listening
        if (isListening) {
          console.log("Restarting recognition...");
          try {
            recognition.start();
          } catch (error) {
            console.error("Error restarting recognition:", error);
            // If restart fails, try again after a short delay
            setTimeout(() => {
              if (isListening) {
                try {
                  recognition.start();
                } catch (e) {
                  console.error("Second restart attempt failed:", e);
                  setIsListening(false);
                }
              }
            }, 100);
          }
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      clearTimers();
    };
  }, [isListening]);

  // Auto-clear transcript setiap 5 detik
  const resetAutoClearTimer = () => {
    // Clear existing timers
    clearTimers();
    
    // Reset countdown
    setCountdown(5);
    
    // Start countdown timer
    let count = 5;
    countdownTimerRef.current = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(countdownTimerRef.current!);
      }
    }, 1000);

    // Set clear timer
    clearTimerRef.current = setTimeout(() => {
      setTranscript("");
      setInterimTranscript("");
      setCountdown(5);
    }, 5000);
  };

  const clearTimers = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  // Start timer when transcript has content
  useEffect(() => {
    if (transcript && isListening) {
      resetAutoClearTimer();
    } else {
      clearTimers();
      setCountdown(5);
    }
    
    return () => clearTimers();
  }, [transcript, isListening]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      console.log("Stopping recognition...");
      setIsListening(false); // Set state first to prevent auto-restart
      recognitionRef.current.stop();
      stopAudioVisualization();
    } else {
      console.log("Starting recognition...");
      setIsListening(true); // Set state first to enable auto-restart
      try {
        recognitionRef.current.start();
        startAudioVisualization();
      } catch (error) {
        console.error("Error starting recognition:", error);
        setIsListening(false);
        alert("Failed to start speech recognition. Please refresh the page and try again.");
      }
    }
  };

  // Audio visualization
  const startAudioVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      visualizeAudio();
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const visualizeAudio = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Normalize values to 0-1 range
    const normalizedLevels = Array.from(dataArray).map((value) => value / 255);
    setAudioLevels(normalizedLevels);

    animationFrameRef.current = requestAnimationFrame(visualizeAudio);
  };

  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setAudioLevels(new Array(32).fill(0));
  };

  const clearTranscript = () => {
    setTranscript("");
    setInterimTranscript("");
  };

  // Screen sharing functionality
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: false,
      });
      
      console.log("Screen stream obtained:", screenStream);
      screenStreamRef.current = screenStream;
      
      // Create hidden video element to receive stream
      const video = document.createElement('video');
      video.srcObject = screenStream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      
      videoRef.current = video;
      
      video.onloadedmetadata = async () => {
        console.log("Video metadata loaded");
        console.log("Video dimensions:", video.videoWidth, "x", video.videoHeight);
        console.log("Video readyState:", video.readyState);
        
        // Wait for video to actually start playing
        try {
          await video.play();
          console.log("Video playing, readyState:", video.readyState);
          
          // Wait a bit more to ensure frames are available
          setTimeout(() => {
            console.log("Starting canvas rendering...");
            renderScreenToCanvas();
            setIsVideoLoaded(true);
          }, 500);
        } catch (playError) {
          console.error("Play error:", playError);
        }
      };

      // Handle when user stops sharing
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      setIsScreenSharing(true);
    } catch (error) {
      console.error("Error starting screen share:", error);
      if ((error as any).name === "NotAllowedError") {
        alert("Screen sharing permission denied. Please allow screen sharing.");
      } else {
        alert("Failed to start screen sharing: " + (error as any).message);
      }
    }
  };

  const renderScreenToCanvas = () => {
    if (!videoRef.current || !canvasRef.current) {
      console.error("Video or canvas ref not available");
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error("Cannot get 2d context");
      return;
    }

    console.log("Starting draw loop...");

    const draw = () => {
      if (!video || !canvas) {
        console.log("Video or canvas lost");
        return;
      }

      if (video.readyState < 2) {
        console.log("Video not ready, readyState:", video.readyState);
        screenAnimationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      // Set canvas size to match video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        console.log("Setting canvas size:", video.videoWidth, "x", video.videoHeight);
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      try {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (drawError) {
        console.error("Draw error:", drawError);
      }
      
      screenAnimationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const stopScreenShare = () => {
    // Stop animation frame
    if (screenAnimationFrameRef.current) {
      cancelAnimationFrame(screenAnimationFrameRef.current);
      screenAnimationFrameRef.current = null;
    }
    
    // Stop stream
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    
    // Clean up video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null as any;
    }
    
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    
    setIsScreenSharing(false);
    setIsVideoLoaded(false);
  };

  if (!isSupported) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-red-400 text-lg">
            Speech Recognition is not supported in this browser.
          </p>
          <p className="text-zinc-500 mt-2">
            Please use Chrome, Edge, or Safari.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black font-sans">
      {/* Header */}
      <header className="border-b border-zinc-800/50 backdrop-blur-sm bg-black/30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* User Avatar */}
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-red-600 via-red-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg shadow-red-900/30 ring-2 ring-red-500/20">
                <span className="text-white font-bold text-lg">FV</span>
              </div>
              {isListening && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                RayyanFv's Assistant
              </h1>
              <p className="text-xs text-zinc-500 tracking-wide">
                {isListening ? "Listening to your voice" : "Ready to assist you"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isScreenSharing && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-600/10 border border-green-600/30 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-green-400 tracking-wider">
                  SHARING
                </span>
              </div>
            )}
            {isListening && (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/10 border border-red-600/30 rounded-full">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-medium text-red-400 tracking-wider">
                    LIVE
                  </span>
                </div>
                {transcript && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full">
                    <span className="text-xs font-medium text-zinc-400 tracking-wider">
                      {countdown}s
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Mode 1: No Screen Share - Pure Transcription */}
        {!isScreenSharing ? (
          <>
            {/* Audio Visualizer */}
            {isListening && (
              <div className="mb-8">
                <div className="flex items-end justify-center gap-1 h-24 px-8">
                  {audioLevels.map((level, index) => (
                    <div
                      key={index}
                      className="flex-1 bg-gradient-to-t from-red-600 via-red-500 to-red-400 rounded-t-full transition-all duration-75 ease-out"
                      style={{
                        height: `${Math.max(level * 100, 2)}%`,
                        opacity: level > 0.1 ? 0.8 + level * 0.2 : 0.3,
                        boxShadow: level > 0.5 ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none'
                      }}
                    />
                  ))}
                </div>
                <div className="text-center mt-2">
                  <p className="text-xs text-zinc-600 tracking-wider uppercase">
                    Audio Level Monitor
                  </p>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mb-12">
              <button
                onClick={toggleListening}
                className={`group relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isListening
                    ? "bg-gradient-to-br from-red-600 to-red-700 shadow-2xl shadow-red-600/40 scale-110"
                    : "bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {isListening ? (
                  <MicOff className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-zinc-400 group-hover:text-white transition-colors" />
                )}
                {isListening && (
                  <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-20"></div>
                )}
              </button>

              <button
                onClick={toggleScreenShare}
                className="group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 hover:border-zinc-700"
              >
                <MonitorPlay className="w-6 h-6 text-zinc-400 group-hover:text-white transition-colors" />
              </button>

              {transcript && (
                <button
                  onClick={clearTranscript}
                  className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-full text-sm font-medium text-zinc-400 hover:text-white transition-all duration-200"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Transcription Display */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-red-600/20 via-zinc-800/20 to-red-600/20 rounded-2xl blur-xl"></div>
              <div className="relative bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/50 rounded-2xl overflow-hidden shadow-2xl">
                {/* Progress bar countdown */}
                {transcript && isListening && (
                  <div className="h-1 bg-zinc-900">
                    <div 
                      className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${(countdown / 5) * 100}%` }}
                    ></div>
                  </div>
                )}
                <div className="p-8 min-h-[400px]">
                  {!transcript && !interimTranscript ? (
                    <div className="flex flex-col items-center justify-center h-[350px] text-center">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center mb-4 ring-2 ring-zinc-800">
                        <Mic className="w-8 h-8 text-zinc-500" />
                      </div>
                      <p className="text-zinc-400 text-xl mb-2 font-light">
                        {isListening
                          ? "I'm listening, Rayyan..."
                          : "Hey Rayyan, ready when you are!"}
                      </p>
                      <p className="text-zinc-600 text-sm">
                        {isListening
                          ? "Your words will appear here in real-time"
                          : "Tap the microphone below to begin"}
                      </p>
                      <p className="text-zinc-700 text-xs mt-3 px-4 py-2 bg-zinc-900/50 rounded-full">
                        Auto-clears every 5 seconds for seamless subtitles
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Final Transcript */}
                      {transcript && (
                        <p className="text-white text-2xl leading-relaxed font-light tracking-wide">
                          {transcript}
                        </p>
                      )}
                      {/* Interim Transcript */}
                      {interimTranscript && (
                        <p className="text-zinc-500 text-2xl leading-relaxed font-light tracking-wide italic">
                          {interimTranscript}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Personal Info Card */}
            {!isListening && !transcript && (
              <div className="mt-8">
                <div className="bg-gradient-to-br from-zinc-950/80 to-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 backdrop-blur-sm">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-red-600 via-red-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg flex-shrink-0">
                      <span className="text-white font-bold text-lg">FV</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold text-lg mb-2">Your Personal Speech Assistant</h3>
                      <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                        Hi <span className="text-red-400 font-medium">Rayyan</span>! I'm your personal transcription assistant, 
                        designed to capture your voice in real-time with precision. Perfect for presentations, 
                        meetings, or creating live subtitles.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                          Auto-clear every 5s
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                          Real-time visualization
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                          Indonesian & English
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Mode 2: Screen Share with Subtitle Overlay */
          <div className="space-y-4">
            {/* Screen Share Display with Overlay */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-green-600/20 via-zinc-800/20 to-green-600/20 rounded-2xl blur-xl"></div>
              <div className="relative bg-zinc-900 backdrop-blur-xl border border-zinc-800/50 rounded-2xl overflow-hidden shadow-2xl">
                <div className="w-full flex items-center justify-center bg-black relative" style={{ height: 'calc(100vh - 300px)', minHeight: '500px', maxHeight: '800px' }}>
                  <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-full object-contain"
                  />
                  
                  {!isVideoLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <MonitorPlay className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                        <p className="text-zinc-500 text-sm">Loading screen share...</p>
                      </div>
                    </div>
                  )}

                  {/* Subtitle Overlay - Bottom */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-6">
                    {/* Progress bar */}
                    {transcript && isListening && (
                      <div className="mb-4 h-1 bg-zinc-800/50 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-1000 ease-linear"
                          style={{ width: `${(countdown / 5) * 100}%` }}
                        ></div>
                      </div>
                    )}
                    
                    {/* Subtitle Text */}
                    <div className="max-w-5xl mx-auto">
                      {!transcript && !interimTranscript ? (
                        <p className="text-zinc-400 text-lg text-center font-light">
                          {isListening ? "Listening for speech..." : "Start speaking to see subtitles"}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {/* Final Transcript */}
                          {transcript && (
                            <p className="text-white text-2xl md:text-3xl leading-snug font-light tracking-wide text-center drop-shadow-2xl"
                               style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.8)' }}>
                              {transcript}
                            </p>
                          )}
                          {/* Interim Transcript */}
                          {interimTranscript && (
                            <p className="text-zinc-300 text-2xl md:text-3xl leading-snug font-light tracking-wide italic text-center drop-shadow-2xl"
                               style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.8)' }}>
                              {interimTranscript}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stream Status Badge */}
                  <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg">
                    <p className="text-xs text-zinc-400">
                      Stream: {isScreenSharing ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Controls - Bottom */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={toggleListening}
                className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isListening
                    ? "bg-gradient-to-br from-red-600 to-red-700 shadow-2xl shadow-red-600/40"
                    : "bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {isListening ? (
                  <MicOff className="w-6 h-6 text-white" />
                ) : (
                  <Mic className="w-6 h-6 text-zinc-400 group-hover:text-white transition-colors" />
                )}
                {isListening && (
                  <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-20"></div>
                )}
              </button>

              <button
                onClick={toggleScreenShare}
                className="group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 bg-gradient-to-br from-green-600 to-green-700 shadow-2xl shadow-green-600/40"
              >
                <MonitorOff className="w-6 h-6 text-white" />
              </button>

              {transcript && (
                <button
                  onClick={clearTranscript}
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-full text-sm font-medium text-zinc-400 hover:text-white transition-all duration-200"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
