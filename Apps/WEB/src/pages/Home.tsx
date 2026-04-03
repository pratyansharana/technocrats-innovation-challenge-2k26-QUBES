import React from 'react';
import '../styles/Home.css';

const Home: React.FC = () => {
  return (
    <div className="home-container">
      <iframe
        src="https://my.spline.design/thebluemarble-ceUMe5X6TRu9xIijySTii64T/"
        frameBorder="0"
        className="spline-iframe"
        title="3D Blue Marble Model"
      />
    </div>
  );
};

export default Home;
