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

const parsePct = (val) => {
  if (typeof val === 'string' && val.includes('%')) {
    return parseFloat(val.replace('%', ''));
  }
  return parseFloat(val) || 0;
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
  let compoundedBenchNav = 100000; // Starting at $100k
  let compoundedPortfolioNav = 100000;

  const startDate = new Date(dataRows[0].Date);

  dataRows.forEach((row, i) => {
    let portfolioValue = 0;
    tickers.forEach(t => {
      const val = parseFloat(row[t]);
      // If data is missing (weekends) or invalid, fallback to previous day if available
      portfolioValue += isNaN(val) ? (prevPortfolioValue || 0) : val;
    });

    // Composite Benchmark Math
    let aggVal = parseFloat(row.AGG_Bench);
    let spyVal = parseFloat(row.SPY_Bench);
    let qqqVal = parseFloat(row.QQQ_Bench);

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
      rawRow: row
    });
  });

  const latestRow = performanceHistory[performanceHistory.length - 1];
  const firstRow = performanceHistory[0];

  // Holding Period Return
  const hpr = (latestRow.portfolioValue / firstRow.portfolioValue) - 1;
  const benchHpr = (latestRow.benchmarkNav / firstRow.benchmarkNav) - 1;
  
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
    const liveVal = parseFloat(latestRow.rawRow[h.ticker]) || 0;
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
