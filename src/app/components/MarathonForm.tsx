'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TrainingPlan from './TrainingPlan';

export default function MarathonForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    raceDate: '',
    goalTime: {
      hours: '',
      minutes: '',
      seconds: ''
    },
    currentMileage: ''
  });
  const [trainingPlan, setTrainingPlan] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Poll for updates when we have a requestId
  useEffect(() => {
    if (!requestId || !isLoading) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/generate-plan?requestId=${requestId}`);
        if (!response.ok) throw new Error('Failed to check status');
        
        const data = await response.json();
        
        if (data.status === 'complete') {
          setTrainingPlan(data.plan);
          setIsLoading(false);
          clearInterval(pollInterval);
        } else if (data.status === 'error') {
          setError(data.error || 'Failed to generate plan');
          setIsLoading(false);
          clearInterval(pollInterval);
        } else {
          setProgress(data.progress);
        }
      } catch (error) {
        console.error('Error checking status:', error);
        setError('Failed to check plan status');
        setIsLoading(false);
        clearInterval(pollInterval);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [requestId, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setTrainingPlan('');
    setProgress(0);
    
    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) throw new Error('Failed to start plan generation');
      
      const data = await response.json();
      setRequestId(data.requestId);
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to start plan generation. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-6 p-6">
        <div className="space-y-2">
          <label htmlFor="raceDate" className="block text-sm font-medium text-white">
            When is your race?
          </label>
          <input
            type="date"
            id="raceDate"
            value={formData.raceDate}
            onChange={(e) => setFormData({ ...formData, raceDate: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
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
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
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
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
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
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
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
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
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
          {isLoading ? `Generating Plan (${progress}%)...` : 'Generate Training Plan'}
        </button>

        {error && (
          <p className="text-red-500 text-sm text-center mt-2">{error}</p>
        )}
      </form>

      {trainingPlan && (
        <div className="space-y-4">
          <TrainingPlan plan={trainingPlan} />
        </div>
      )}
    </>
  );
} 