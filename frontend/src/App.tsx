import { BrowserRouter, Route, Routes } from "react-router";
import Home from "./Home";
import Upload from "./Upload";
import Room from "./Room";
import Duels from "./Duels";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/room/:deckId" element={<Room />} />
        <Route path="/duels" element={<Duels />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
