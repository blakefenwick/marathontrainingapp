'use client';

// Version 1.0.1 - Email-based plan generation with progress tracking
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TrainingPlan from './TrainingPlan';

export default function MarathonForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    raceDate: '',
    goalTime: {
      hours: '',
      minutes: '',
      seconds: ''
    },
    currentMileage: ''
  });
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [plan, setPlan] = useState<string>('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Poll for status updates
  useEffect(() => {
    if (!requestId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/generate-plan?requestId=${requestId}`);
        if (!response.ok) throw new Error('Failed to check status');
        
        const data = await response.json();
        setStatus(data.status);
        
        if (data.status === 'completed') {
          setPlan(data.plan);
          clearInterval(pollInterval);
          setIsLoading(false);
        } else if (data.status === 'error') {
          setError('Failed to generate plan. Please try again.');
          clearInterval(pollInterval);
          setIsLoading(false);
        } else if (data.status === 'processing') {
          setPlan(data.plan || '');
        }
      } catch (error) {
        console.error('Error checking status:', error);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [requestId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setPlan('');
    setRequestId(null);
    
    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) throw new Error('Failed to generate plan');
      
      const data = await response.json();
      setRequestId(data.requestId);
      setStatus('processing');
      
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to generate plan. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-6 p-6">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-white">
            Your Email Address
          </label>
          <p className="text-sm text-gray-300 mb-2">
            We'll email you your training plan when it's ready. You can also view it here in the app.
          </p>
          <input
            type="email"
            id="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="raceDate" className="block text-sm font-medium text-white">
            When is your race?
          </label>
          <input
            type="date"
            id="raceDate"
            value={formData.raceDate}
            onChange={(e) => setFormData({ ...formData, raceDate: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">
            What is your goal finish time?
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <input
                type="number"
                placeholder="Hours"
                min="0"
                max="23"
                value={formData.goalTime.hours}
                onChange={(e) => setFormData({
                  ...formData,
                  goalTime: { ...formData.goalTime, hours: e.target.value }
                })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
                required
              />
            </div>
            <div>
              <input
                type="number"
                placeholder="Minutes"
                min="0"
                max="59"
                value={formData.goalTime.minutes}
                onChange={(e) => setFormData({
                  ...formData,
                  goalTime: { ...formData.goalTime, minutes: e.target.value }
                })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
                required
              />
            </div>
            <div>
              <input
                type="number"
                placeholder="Seconds"
                min="0"
                max="59"
                value={formData.goalTime.seconds}
                onChange={(e) => setFormData({
                  ...formData,
                  goalTime: { ...formData.goalTime, seconds: e.target.value }
                })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="currentMileage" className="block text-sm font-medium text-white">
            How many miles per week are you currently running?
          </label>
          <input
            type="number"
            id="currentMileage"
            min="0"
            step="0.1"
            value={formData.currentMileage}
            onChange={(e) => setFormData({ ...formData, currentMileage: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? 'Generating Plan...' : 'Generate Training Plan'}
        </button>

        {error && (
          <p className="text-red-500 text-sm text-center mt-2">{error}</p>
        )}

        {status === 'processing' && (
          <div className="text-center mt-4">
            <p className="text-green-500 text-sm mb-2">
              Generating your training plan...
            </p>
            <p className="text-gray-300 text-sm">
              We'll email it to {formData.email} when it's ready. You can also view it here in the app.
            </p>
          </div>
        )}
      </form>

      {plan && (
        <div className="space-y-4">
          <TrainingPlan plan={plan} />
        </div>
      )}
    </>
  );
} 