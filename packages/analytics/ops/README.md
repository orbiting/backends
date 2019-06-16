# run analytics on EC2

Run you analytics code on a high performance EC2 machine. This setup makes it easy to create and destroy a machine on demand.

## preparation

1. Install: terraform
2. Create `~/.aws/credentials`
```
[default]
aws_access_key_id =
aws_secret_access_key =
```
3. Create `analytics/ops/secrets/.env` (check the example there)
3. Get `analytics.pem` from keybase and place it in `analytics/ops/secrets/analytics.pem`


## run it

1. create machine: `terraform apply -auto-approve`
2. setup machine: `./install`. After that the machine will reboot, so wait a bit.
3. sync repo and `secrets/.env` and `yarn install`: `./syncInitial`
4. ssh to the machine: `./connect`
You land inside the backends repository on the remote machine and everything is ready for you to run analytics code, like: `yarn run analytics insert referers 2018-01-01 18 months --workers 23`

## dev

After you change code you just execute `./sync` and run you command on the remote machine.

## clean up

After you finished work with the machine run `terraform destroy -auto-approve` to clean up everything. The machine and all it's data will be deleted.
