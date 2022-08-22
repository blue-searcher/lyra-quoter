
async function main() {
  const [deployer] = await ethers.getSigners();
    
  console.log("Deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("LyraQuoter", {
    libraries: {
      BlackScholes: "0xE97831964bF41C564EDF6629f818Ed36C85fD520",
    },
  });
  const contract = await Factory.connect(deployer).deploy(
    "0x1d42a98848e022908069c2c545aE44Cc78509Bc8",
    "0xbfa31380ED380cEb325153eA08f296A45A489108",
    "0x5Db73886c4730dBF3C562ebf8044E19E8C93843e",
    "0x73b161f1bcF37048A5173619cda53aaa56A28Be0",
    "0xbb3e8Eac35e649ed1071A9Ec42223d474e67b19A"
  );

  console.log("Address:", contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
