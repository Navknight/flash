import { BrowserRouter, Route, Routes } from "react-router";
import Home from "./Home";
import Upload from "./Upload";
import Room from "./Room";
import Duels from "./Duels";
import Nav from "./Nav";
import Leaderboard from "./Leaderboard";
import Profile from "./Profile";

function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/room/:deckId" element={<Room />} />
        <Route path="/duels" element={<Duels />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/u/:uid" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
