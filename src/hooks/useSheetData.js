import { useState, useEffect } from 'react';
import { parseCSVData } from '../utils/csvParser';

// Fetch from the user's published Google Sheet CSV
const DATA_URL = 'https://docs.google.com/spreadsheets/d/17QmDatEE364ahOmse7O0BX6SAvsZUrPvAcYOhUKB-jw/export?format=csv&gid=0';

export const useSheetData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        // Add cache busting for live updates
        const separator = DATA_URL.includes('?') ? '&' : '?';
        const response = await fetch(`${DATA_URL}${separator}t=${new Date().getTime()}`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const csvText = await response.text();
        const parsedData = await parseCSVData(csvText);
        
        if (isMounted) {
          setData(parsedData);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    // Optionally set up an interval to poll data
    const interval = setInterval(fetchData, 60000); // Poll every minute

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { data, loading, error };
};
