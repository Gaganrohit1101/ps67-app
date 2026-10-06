import {createRoot} from 'react-dom/client';
import {BrowserRouter,NavLink,Routes,Route} from 'react-router';
import {UserRound,Compass,PenLine,ExternalLink} from 'lucide-react';
import {AuthProvider,WalletBar,ServiceStatus,useAuth} from '../shared/Auth';
import {ProfileScreen} from './ProfileScreen';
import EditProfile from './EditProfile';
import {ThemeProvider} from '../shared/ThemeContext';
import {Brand,Empty,appURL} from '../shared/components';
import '../shared/figma.css';
import '../shared/integration.css';
function App(){const {epoch}=useAuth();return <div className="app-shell"><a className="skip-link" href="#main">Skip to main content</a><aside className="sidebar"><Brand/><nav className="side-nav" aria-label="Primary navigation"><NavLink className="nav-link" to="/profile"><UserRound/>Profile</NavLink><NavLink className="nav-link" to="/edit-profile"><PenLine/>Edit & privacy</NavLink><NavLink className="nav-link" to="/explore"><Compass/>Explore people</NavLink></nav><div className="sidebar-bottom"><a className="explorer-link" href={appURL(8001)} target="_blank" rel="noopener noreferrer"><ExternalLink size={18}/>Open Atlas Explorer</a><small>INNOBLOCK 2.0 · PS67</small></div></aside><main id="main" tabIndex={-1} className="app-main"><header className="integration-header"><Brand/><WalletBar/></header><ServiceStatus/><Routes key={epoch}><Route path="/" element={<ProfileScreen/>}/><Route path="/profile" element={<ProfileScreen/>}/><Route path="/edit-profile" element={<EditProfile/>}/><Route path="/explore" element={<ProfileScreen explore/>}/><Route path="*" element={<div className="page-wrap"><Empty title="Page not found"><a href="/profile">Return to your profile</a></Empty></div>}/></Routes></main><nav className="bottom-nav" aria-label="Mobile navigation"><NavLink to="/profile"><UserRound/>Profile</NavLink><NavLink to="/edit-profile"><PenLine/>Edit</NavLink><NavLink to="/explore"><Compass/>Explore</NavLink><a href={appURL(8001)}><ExternalLink/>Atlas</a></nav></div>;}
createRoot(document.getElementById('root')!).render(<ThemeProvider><AuthProvider><BrowserRouter><App/></BrowserRouter></AuthProvider></ThemeProvider>);
