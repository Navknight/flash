import { BrowserRouter, Route, Routes } from "react-router";
import Home from "./Home";
import Upload from "./Upload";
import Room from "./Room";
import Duels from "./Duels";
import Nav from "./Nav";
import Leaderboard from "./Leaderboard";

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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
