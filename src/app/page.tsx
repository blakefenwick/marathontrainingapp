import MarathonForm from './components/MarathonForm';

// Version 1.8.2 - Restore original styling
export default function Home() {
  return (
    <main className="min-h-screen bg-blue-900 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-4 text-white">Marathon Training Plan Generator</h1>
        <p className="text-xl mb-8 text-gray-300">Generate a personalized training plan for your next marathon</p>
        <MarathonForm />
      </div>
    </main>
  );
}
