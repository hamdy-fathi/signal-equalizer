import Link from "next/link";
import { Geist } from "next/font/google";

const geist = Geist({ subsets: ["latin"] });

export default function LandingPage() {
  return (
    <main className={`min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-8 relative overflow-hidden ${geist.className}`}>
      {/* Background decoration */ }
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-eq-magenta/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-eq-cyan/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="z-10 text-center max-w-3xl flex flex-col items-center">
        <h1 className="text-6xl font-bold tracking-tighter mb-6 bg-gradient-to-r from-eq-magenta via-eq-orange to-eq-yellow text-transparent bg-clip-text">
          Signal Equalizer
        </h1>
        <p className="text-xl text-zinc-400 mb-8 leading-relaxed">
          A professional-grade web application for signal manipulation. 
          Modify frequency components natively in the browser with precision. 
          Supports Musical, Animal, Human Voice, and ECG modes with built-in 
          Cine Viewers and real-time Spectrograms.
        </p>
        
        <div className="flex gap-4">
          <Link 
            href="/eq" 
            className="px-8 py-4 bg-zinc-100 text-zinc-900 font-semibold rounded-full hover:bg-white transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
          >
            Launch Equalizer
          </Link>
          <a
            href="#features"
            className="px-8 py-4 bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold rounded-full hover:bg-zinc-800 transition-all"
          >
            Overview
          </a>
        </div>
      </div>

      {/* Features Overview */}
      <div id="features" className="mt-32 z-10 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
        <FeatureCard title="Multiple Modes" desc="Generic, Musical Instruments, Animal Sounds, Human Voices, and ECG Arrythmias." />
        <FeatureCard title="Pro Visualization" desc="Real-time interactive Fourier Transform graph with both Linear and Audiogram scales." />
        <FeatureCard title="Advanced Analysis" desc="Dual synchronized Cine Viewers and responsive Spectrograms for accurate signal tracking." />
      </div>
    </main>
  );
}

function FeatureCard({ title, desc }: { title: string, desc: string }) {
  return (
    <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">{title}</h3>
      <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
    </div>
  );
}
