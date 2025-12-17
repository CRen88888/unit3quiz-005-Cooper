import { useState, useEffect, useMemo } from 'react';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot,
  increment 
} from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';
import Papa from 'papaparse';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ITEM_TYPES = ['BEER', 'WINE', 'LIQUOR', 'KEGS', 'NON-ALCOHOL'];

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [votes, setVotes] = useState({ support: 0, against: 0 });
  const [userVote, setUserVote] = useState(null);
  const [chartView, setChartView] = useState('monthly');

  // Load CSV data
  useEffect(() => {
    Papa.parse('/Warehouse_and_Retail_Sales.csv', {
      download: true,
      header: true,
      complete: (results) => {
        const cleanData = results.data.filter(row => 
          row.YEAR && row.MONTH && row['ITEM TYPE'] && ITEM_TYPES.includes(row['ITEM TYPE'])
        );
        setData(cleanData);
        setLoading(false);
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        setLoading(false);
      }
    });
  }, []);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user has voted
        getDoc(doc(db, 'userVotes', currentUser.uid)).then((docSnap) => {
          if (docSnap.exists()) {
            setUserVote(docSnap.data().vote);
          }
        });
      } else {
        setUserVote(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to vote counts
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'votes', 'salesData'), (docSnap) => {
      if (docSnap.exists()) {
        setVotes(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleVote = async (voteType) => {
    if (!user || userVote) return;
    
    try {
      // Record user's vote
      await setDoc(doc(db, 'userVotes', user.uid), {
        vote: voteType,
        timestamp: new Date()
      });
      
      // Update vote count
      const voteRef = doc(db, 'votes', 'salesData');
      const voteSnap = await getDoc(voteRef);
      
      if (voteSnap.exists()) {
        await setDoc(voteRef, {
          [voteType]: increment(1)
        }, { merge: true });
      } else {
        await setDoc(voteRef, {
          support: voteType === 'support' ? 1 : 0,
          against: voteType === 'against' ? 1 : 0
        });
      }
      
      setUserVote(voteType);
    } catch (error) {
      console.error('Vote error:', error);
    }
  };

  // Get unique years and suppliers
  const years = useMemo(() => {
    const uniqueYears = [...new Set(data.map(row => row.YEAR))].sort();
    return uniqueYears;
  }, [data]);

  const suppliers = useMemo(() => {
    const uniqueSuppliers = [...new Set(data.map(row => row.SUPPLIER))].filter(Boolean).sort();
    return uniqueSuppliers.slice(0, 50); // Limit to top 50 for performance
  }, [data]);

  // Filter data based on selections
  const filteredData = useMemo(() => {
    return data.filter(row => {
      if (selectedType !== 'ALL' && row['ITEM TYPE'] !== selectedType) return false;
      if (selectedYear !== 'ALL' && row.YEAR !== selectedYear) return false;
      if (selectedSupplier !== 'ALL' && row.SUPPLIER !== selectedSupplier) return false;
      return true;
    });
  }, [data, selectedType, selectedYear, selectedSupplier]);

  // Aggregate data by month for line/bar charts
  const monthlyData = useMemo(() => {
    const aggregated = {};
    
    filteredData.forEach(row => {
      const key = `${row.YEAR}-${row.MONTH.padStart(2, '0')}`;
      if (!aggregated[key]) {
        aggregated[key] = { retail: 0, warehouse: 0, count: 0 };
      }
      aggregated[key].retail += parseFloat(row['RETAIL SALES'] || 0);
      aggregated[key].warehouse += parseFloat(row['WAREHOUSE SALES'] || 0);
      aggregated[key].count += 1;
    });
    
    const sorted = Object.entries(aggregated).sort((a, b) => a[0].localeCompare(b[0]));
    return {
      labels: sorted.map(([key]) => {
        const [year, month] = key.split('-');
        return `${MONTHS[parseInt(month) - 1]} ${year}`;
      }),
      retail: sorted.map(([, val]) => val.retail),
      warehouse: sorted.map(([, val]) => val.warehouse)
    };
  }, [filteredData]);

  // Aggregate data by item type for doughnut chart
  const typeData = useMemo(() => {
    const aggregated = {};
    
    filteredData.forEach(row => {
      const type = row['ITEM TYPE'];
      if (!aggregated[type]) {
        aggregated[type] = 0;
      }
      aggregated[type] += parseFloat(row['RETAIL SALES'] || 0) + parseFloat(row['WAREHOUSE SALES'] || 0);
    });
    
    return {
      labels: Object.keys(aggregated),
      values: Object.values(aggregated)
    };
  }, [filteredData]);

  // Summary statistics
  const stats = useMemo(() => {
    let totalRetail = 0;
    let totalWarehouse = 0;
    
    filteredData.forEach(row => {
      totalRetail += parseFloat(row['RETAIL SALES'] || 0);
      totalWarehouse += parseFloat(row['WAREHOUSE SALES'] || 0);
    });
    
    return {
      totalRecords: filteredData.length,
      totalRetail: totalRetail.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      totalWarehouse: totalWarehouse.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      totalSales: (totalRetail + totalWarehouse).toLocaleString('en-US', { maximumFractionDigits: 0 })
    };
  }, [filteredData]);

  const lineChartData = {
    labels: monthlyData.labels,
    datasets: [
      {
        label: 'Retail Sales',
        data: monthlyData.retail,
        borderColor: '#ff6b6b',
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Warehouse Sales',
        data: monthlyData.warehouse,
        borderColor: '#4ecdc4',
        backgroundColor: 'rgba(78, 205, 196, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const barChartData = {
    labels: monthlyData.labels,
    datasets: [
      {
        label: 'Retail Sales',
        data: monthlyData.retail,
        backgroundColor: 'rgba(255, 107, 107, 0.8)',
        borderRadius: 4,
      },
      {
        label: 'Warehouse Sales',
        data: monthlyData.warehouse,
        backgroundColor: 'rgba(78, 205, 196, 0.8)',
        borderRadius: 4,
      },
    ],
  };

  const doughnutData = {
    labels: typeData.labels,
    datasets: [
      {
        data: typeData.values,
        backgroundColor: [
          '#ff6b6b',
          '#4ecdc4',
          '#ffe66d',
          '#95e1d3',
          '#f38181',
        ],
        borderWidth: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#e0e0e0',
          font: { family: 'JetBrains Mono, monospace', size: 11 }
        }
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        ticks: { 
          color: '#888',
          font: { family: 'JetBrains Mono, monospace', size: 10 },
          maxRotation: 45,
          minRotation: 45
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      },
      y: {
        ticks: { 
          color: '#888',
          font: { family: 'JetBrains Mono, monospace', size: 10 }
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#e0e0e0',
          font: { family: 'JetBrains Mono, monospace', size: 11 },
          padding: 15
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
        <p>Loading sales data...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="grain-overlay"></div>
      
      <header className="header">
        <div className="header-content">
          <div className="brand">
            <div className="brand-icon">📊</div>
            <div>
              <h1>Sales Analytics</h1>
              <p className="subtitle">Warehouse & Retail Data Explorer</p>
            </div>
          </div>
          
          <div className="auth-section">
            {user ? (
              <div className="user-info">
                <img src={user.photoURL} alt="" className="avatar" />
                <span>{user.displayName}</span>
                <button onClick={handleSignOut} className="btn btn-ghost">
                  Sign Out
                </button>
              </div>
            ) : (
              <button onClick={handleSignIn} className="btn btn-primary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Filters Section */}
        <section className="filters-section">
          <div className="filter-group">
            <label>Item Type</label>
            <select 
              value={selectedType} 
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="ALL">All Types</option>
              {ITEM_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Year</label>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="ALL">All Years</option>
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Supplier</label>
            <select 
              value={selectedSupplier} 
              onChange={(e) => setSelectedSupplier(e.target.value)}
            >
              <option value="ALL">All Suppliers</option>
              {suppliers.map(supplier => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Chart View</label>
            <div className="view-toggle">
              <button 
                className={chartView === 'monthly' ? 'active' : ''} 
                onClick={() => setChartView('monthly')}
              >
                Line
              </button>
              <button 
                className={chartView === 'bar' ? 'active' : ''} 
                onClick={() => setChartView('bar')}
              >
                Bar
              </button>
            </div>
          </div>
        </section>

        {/* Stats Cards */}
        <section className="stats-section">
          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <div className="stat-content">
              <span className="stat-value">{stats.totalRecords.toLocaleString()}</span>
              <span className="stat-label">Total Records</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🏪</div>
            <div className="stat-content">
              <span className="stat-value">${stats.totalRetail}</span>
              <span className="stat-label">Retail Sales</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🏭</div>
            <div className="stat-content">
              <span className="stat-value">${stats.totalWarehouse}</span>
              <span className="stat-label">Warehouse Sales</span>
            </div>
          </div>
          <div className="stat-card highlight">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <span className="stat-value">${stats.totalSales}</span>
              <span className="stat-label">Total Sales</span>
            </div>
          </div>
        </section>

        {/* Charts Grid */}
        <section className="charts-section">
          <div className="chart-container main-chart">
            <h3>Monthly Sales Trend</h3>
            <div className="chart-wrapper">
              {chartView === 'monthly' ? (
                <Line data={lineChartData} options={chartOptions} />
              ) : (
                <Bar data={barChartData} options={chartOptions} />
              )}
            </div>
          </div>

          <div className="chart-container side-chart">
            <h3>Sales by Category</h3>
            <div className="chart-wrapper">
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
          </div>
        </section>

        {/* Voting Section */}
        <section className="voting-section">
          <div className="voting-card">
            <h3>Community Opinion</h3>
            <p className="voting-question">
              Should sales regulations be updated based on this data?
            </p>
            
            <div className="vote-results">
              <div className="vote-bar">
                <div 
                  className="vote-fill support" 
                  style={{ 
                    width: `${votes.support + votes.against > 0 
                      ? (votes.support / (votes.support + votes.against)) * 100 
                      : 50}%` 
                  }}
                ></div>
              </div>
              <div className="vote-counts">
                <span className="support-count">{votes.support} Support</span>
                <span className="against-count">{votes.against} Against</span>
              </div>
            </div>

            <div className="vote-buttons">
              {user ? (
                userVote ? (
                  <p className="voted-message">
                    You voted: <strong>{userVote === 'support' ? '✅ Support' : '❌ Against'}</strong>
                  </p>
                ) : (
                  <>
                    <button 
                      className="btn btn-support" 
                      onClick={() => handleVote('support')}
                    >
                      ✅ Support
                    </button>
                    <button 
                      className="btn btn-against" 
                      onClick={() => handleVote('against')}
                    >
                      ❌ Against
                    </button>
                  </>
                )
              ) : (
                <p className="sign-in-prompt">Sign in to vote</p>
              )}
            </div>
          </div>
        </section>

        {/* Data Table Preview */}
        <section className="table-section">
          <h3>Data Preview <span className="badge">{filteredData.length} records</span></h3>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Month</th>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Supplier</th>
                  <th>Retail Sales</th>
                  <th>Warehouse Sales</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(0, 100).map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.YEAR}</td>
                    <td>{MONTHS[parseInt(row.MONTH) - 1]}</td>
                    <td><span className={`type-badge ${row['ITEM TYPE'].toLowerCase()}`}>{row['ITEM TYPE']}</span></td>
                    <td className="item-name">{row['ITEM DESCRIPTION']?.slice(0, 40)}</td>
                    <td className="supplier">{row.SUPPLIER?.slice(0, 25)}</td>
                    <td className="number">${parseFloat(row['RETAIL SALES'] || 0).toFixed(2)}</td>
                    <td className="number">${parseFloat(row['WAREHOUSE SALES'] || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredData.length > 100 && (
            <p className="table-note">Showing first 100 of {filteredData.length.toLocaleString()} records</p>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>Sales Analytics Dashboard • Data from Warehouse & Retail Sales Dataset</p>
      </footer>
    </div>
  );
}

export default App;
