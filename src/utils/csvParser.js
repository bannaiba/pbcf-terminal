import Papa from 'papaparse';

export const parseCSVData = (csvText) => {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        try {
          resolve(formatData(results.data));
        } catch (err) {
          reject(err);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};

const parseMoney = (val) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // Remove currency symbols, commas, and whitespace
    const clean = val.replace(/[$,\s]/g, '');
    return parseFloat(clean) || 0;
  }
  return 0;
};

const parsePct = (val) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const clean = val.replace(/[%\s]/g, '');
    return parseFloat(clean) || 0;
  }
  return 0;
};

const stdDev = (arr) => {
  if (arr.length <= 1) return 0;
  const mean = arr.reduce((a, b) => a + b) / arr.length;
  return Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / (arr.length - 1));
};

const formatData = (data) => {
  if (!data || data.length < 3) throw new Error("Invalid CSV structure. Expected Targets, Sectors, and Data rows.");

  const targetRow = data[0];
  const sectorRow = data[1];
  const dataRows = data.slice(2);

  const headers = Object.keys(targetRow);
  const tickers = headers.filter(k => k !== 'Date' && !k.includes('_Bench') && !k.startsWith('Metric_'));
  
  const fundMetrics = {
    aum: targetRow['Metric_AUM'] || '$100K',
    expectedReturn: targetRow['Metric_ExpectedReturn'] || '9.16%',
    targetVol: targetRow['Metric_TargetVol'] || '12-13%',
    targetSharpe: targetRow['Metric_TargetSharpe'] || '0.70',
    expenseRatio: targetRow['Metric_ExpenseRatio'] || '1.55%'
  };

  const holdingsConfig = tickers.map(t => ({
    ticker: t,
    targetWeight: parsePct(targetRow[t]),
    sector: sectorRow[t]
  }));

  const performanceHistory = [];
  const dailyReturns = [];
  let prevPortfolioValue = null;
  let prevBenchValues = { AGG: null, SPY: null, QQQ: null };
  let prevTickerValues = {}; // Track previous value for each ticker individually
  let compoundedBenchNav = 100000; 
  let compoundedPortfolioNav = 100000;
  const startDate = new Date(dataRows[0].Date);

  dataRows.forEach((row, i) => {
    let portfolioValue = 0;
    tickers.forEach(t => {
      const val = parseMoney(row[t]);
      // Fallback to the previous value FOR THIS SPECIFIC TICKER
      const tickerVal = (isNaN(val) || val === 0) ? (prevTickerValues[t] || 0) : val;
      portfolioValue += tickerVal;
      prevTickerValues[t] = tickerVal; // Store for next row
    });

    // Composite Benchmark Math
    let aggVal = parseMoney(row.AGG_Bench);
    let spyVal = parseMoney(row.SPY_Bench);
    let qqqVal = parseMoney(row.QQQ_Bench);

    // Robust handling for weekends/#N/A: use previous day's value if current is NaN
    if (isNaN(aggVal)) aggVal = prevBenchValues.AGG || 0;
    if (isNaN(spyVal)) spyVal = prevBenchValues.SPY || 0;
    if (isNaN(qqqVal)) qqqVal = prevBenchValues.QQQ || 0;

    if (i > 0) {
      const aggRet = prevBenchValues.AGG ? (aggVal / prevBenchValues.AGG) - 1 : 0;
      const spyRet = prevBenchValues.SPY ? (spyVal / prevBenchValues.SPY) - 1 : 0;
      const qqqRet = prevBenchValues.QQQ ? (qqqVal / prevBenchValues.QQQ) - 1 : 0;

      // 40/40/20 Weighting
      const compositeDailyReturn = (0.40 * aggRet) + (0.40 * spyRet) + (0.20 * qqqRet);
      compoundedBenchNav *= (1 + compositeDailyReturn);

      // Handle portfolio return similarly
      const portfolioDailyRet = prevPortfolioValue ? (portfolioValue / prevPortfolioValue) - 1 : 0;
      compoundedPortfolioNav *= (1 + portfolioDailyRet);
      
      // Only push non-zero returns to avoid skewing volatility on weekends
      if (portfolioDailyRet !== 0) {
        dailyReturns.push(portfolioDailyRet);
      }
    }

    prevPortfolioValue = portfolioValue;
    prevBenchValues = { AGG: aggVal, SPY: spyVal, QQQ: qqqVal };

    performanceHistory.push({
      date: row.Date,
      portfolioValue,
      nav: compoundedPortfolioNav,
      benchmarkNav: compoundedBenchNav,
      sanitizedTickerValues: { ...prevTickerValues }, // Store values used for this row
      rawRow: row
    });
  });

  const latestRow = performanceHistory[performanceHistory.length - 1];
  
  // Find the first row that actually has a non-zero value to use as the base for returns
  const firstValidRow = performanceHistory.find(d => d.portfolioValue > 0) || performanceHistory[0];

  // Holding Period Return
  const hpr = firstValidRow.portfolioValue > 0 
    ? (latestRow.portfolioValue / firstValidRow.portfolioValue) - 1 
    : 0;
    
  const benchHpr = firstValidRow.benchmarkNav > 0 
    ? (latestRow.benchmarkNav / firstValidRow.benchmarkNav) - 1 
    : 0;
  
  // Annualized Return
  const daysElapsed = Math.max(1, (new Date(latestRow.date) - startDate) / (1000 * 60 * 60 * 24));
  const annualizedReturn = (Math.pow(1 + hpr, 365 / daysElapsed) - 1) * 100;

  // Volatility & Sharpe
  const dailyVolatility = stdDev(dailyReturns);
  const annualizedVolatility = dailyVolatility * Math.sqrt(252) * 100;
  const sharpeRatio = dailyVolatility === 0 ? 0 : (annualizedReturn / annualizedVolatility);

  const latestKPIs = {
    nav: latestRow.portfolioValue,
    ytdReturn: hpr * 100, // This is Total Return / HPR
    annualizedReturn: annualizedReturn,
    volatility: annualizedVolatility.toFixed(2) + '%',
    sharpeRatio: sharpeRatio.toFixed(2),
    alpha: (hpr - benchHpr) * 100
  };

  const holdings = holdingsConfig.map(h => {
    // Use the sanitized values we stored (handles weekends correctly)
    const liveVal = latestRow.sanitizedTickerValues[h.ticker] || 0;
    return {
      ...h,
      liveValue: liveVal,
      liveWeight: (liveVal / latestRow.portfolioValue) * 100
    };
  });

  const uniqueSectors = [...new Set(holdings.map(h => h.sector))];
  const allocations = uniqueSectors.map(sector => {
    const sectorHoldings = holdings.filter(h => h.sector === sector);
    return {
      name: sector,
      target: sectorHoldings.reduce((sum, h) => sum + h.targetWeight, 0),
      live: sectorHoldings.reduce((sum, h) => sum + h.liveWeight, 0)
    };
  });

  return {
    performanceHistory,
    latestKPIs,
    holdings,
    allocations,
    fundMetrics
  };
};
