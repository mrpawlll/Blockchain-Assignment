## startup network

./network.sh up createChannel -s couchdb -ca

## down network

./network.sh down

## deploy chaincode

./network.sh deployCC -ccn basic -ccv 1 -ccp ./assignment_chaincode -ccl javascript

## initialize ledger

./network.sh cc invoke -c mychannel -ccn basic -ccqc '{"function":"InitLedger","Args":[]}'

## invoke command

./network.sh cc invoke -c mychannel -ccn basic -ccic '{"Args":["RegisterUser", "user3"]}'

./network.sh cc invoke -c mychannel -ccn basic -ccic '{"Args":["CastVote","user3","candidate1"]}'

## query
./network.sh cc query -c mychannel -ccn basic -ccqc '{"Args":["QueryCandidates","candidate1"]}'
