import {createRoot} from 'react-dom/client';
import {AuthProvider,WalletBar,ServiceStatus,useAuth} from '../shared/Auth';
import Explorer from './Explorer';
import {ThemeProvider} from '../shared/ThemeContext';
import {Brand,Empty} from '../shared/components';
import '../shared/figma.css';
import '../shared/integration.css';
function App(){const {epoch}=useAuth();return <main className="explorer"><a className="skip-link" href="#main">Skip to main content</a><header className="explorer-header"><Brand atlas/><WalletBar/></header><div id="main" tabIndex={-1}><ServiceStatus/><Explorer key={epoch}/></div></main>;}
createRoot(document.getElementById('root')!).render(<ThemeProvider><AuthProvider><App/></AuthProvider></ThemeProvider>);
